import { useCallback, useEffect, useState } from 'react';

import { useSelector } from '@store/store';

import EmbedPlayer from './EmbedPlayer';
import HlsPlayer, { type Subtitle } from './HlsPlayer';

// Our self-hosted source pipeline (Option B). When NEXT_PUBLIC_SOURCE_SERVICE_URL
// is set (local dev / a VPS), we ask it to resolve a real m3u8 (AnimePahe via
// FlareSolverr, proxied through /hls) and play it in our own player (HlsPlayer)
// with quality selection. If it isn't set, resolving fails, or the user prefers
// it, we fall back to the third-party embed switcher. Switchable both ways.

const SOURCE_SERVICE = process.env.NEXT_PUBLIC_SOURCE_SERVICE_URL;

interface Source {
  url: string;
  quality?: string;
}
interface WatchResponse {
  mode: 'direct' | 'embed';
  provider?: string;
  sources?: Source[];
  subtitles?: Subtitle[];
}

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
    {children}
  </div>
);

const SourcePlayer: React.FC<{ titles: string[]; onNext?: () => void }> = ({
  titles,
  onNext,
}) => {
  const animeId = useSelector((store) => store.anime.anime);
  const episode = useSelector((store) => store.episode.episode);
  const useDub = useSelector((store) => store.videoSettings.useDub);

  const [phase, setPhase] = useState<'loading' | 'direct' | 'embed'>(
    SOURCE_SERVICE ? 'loading' : 'embed'
  );
  const [sources, setSources] = useState<Source[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [provider, setProvider] = useState('');
  const [qIdx, setQIdx] = useState(0);
  // Our HLS pipeline resolved, but the browser couldn't decode it (codec) —
  // we auto-dropped to embed and tell the user why.
  const [decodeFailed, setDecodeFailed] = useState(false);

  // Stable key for the titles array (a fresh array every render would loop).
  const titlesKey = titles.join(',');

  // Resolve a direct source from our server. Keeps the resolved sources so the
  // user can switch back to our player after using embed.
  const resolve = useCallback(() => {
    if (!SOURCE_SERVICE) {
      setPhase('embed');
      return undefined;
    }
    setPhase('loading');
    setSources([]);
    setSubtitles([]);
    setQIdx(0);
    setDecodeFailed(false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const category = useDub ? 'dub' : 'sub';
    const url =
      `${SOURCE_SERVICE}/watch?anilistId=${animeId}&episode=${episode}` +
      `&category=${category}&titles=${encodeURIComponent(titlesKey)}`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json() as Promise<WatchResponse>)
      .then((data) => {
        if (data.mode === 'direct' && data.sources && data.sources.length > 0) {
          setSources(data.sources);
          setSubtitles(data.subtitles || []);
          setProvider(data.provider || '');
          setPhase('direct');
        } else {
          setPhase('embed');
        }
      })
      .catch(() => setPhase('embed'))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [animeId, episode, useDub, titlesKey]);

  // Re-resolve whenever the episode / dub changes.
  useEffect(() => resolve(), [resolve]);

  const hasOurPlayer = sources.length > 0;

  // ---- Embed view (manual fallback or resolve/decode failure) ----
  if (phase === 'embed') {
    // decodeFailed: re-showing 'direct' would just hit the same undecodable
    // source, so the retry re-runs the resolver from scratch instead.
    let switchLabel = '↺ Try our server';
    if (decodeFailed) switchLabel = '↺ Retry our player';
    else if (hasOurPlayer) switchLabel = '↺ Switch to our player (HD)';

    const switchHint = decodeFailed
      ? "our player couldn't decode this episode here — using an embed server"
      : 'or pick a third-party server above';

    const onSwitch = () => {
      if (decodeFailed || !hasOurPlayer) resolve();
      else setPhase('direct');
    };

    return (
      <div className="space-y-2.5">
        <EmbedPlayer />
        <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
          <button
            type="button"
            onClick={onSwitch}
            className="rounded-full bg-aurora px-3 py-1 font-semibold text-accent-ink shadow-glow transition active:scale-95"
          >
            {switchLabel}
          </button>
          <span>{switchHint}</span>
        </div>
      </div>
    );
  }

  // ---- Loading our source ----
  if (phase === 'loading') {
    return (
      <div className="space-y-2.5">
        <Frame>
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="text-sm text-muted">Finding the best source…</p>
            <p className="text-xs text-faint">resolving via our server</p>
          </div>
        </Frame>
        <button
          type="button"
          onClick={() => setPhase('embed')}
          className="text-xs font-medium text-faint underline-offset-2 hover:text-fg hover:underline"
        >
          Taking too long? Watch on an embed server instead
        </button>
      </div>
    );
  }

  // ---- Direct (our) player ----
  return (
    <HlsPlayer
      sources={sources}
      qIdx={qIdx}
      onQuality={setQIdx}
      provider={provider}
      subtitles={subtitles}
      onUseEmbed={() => setPhase('embed')}
      onUnplayable={() => {
        setDecodeFailed(true);
        setPhase('embed');
      }}
      onNext={onNext}
    />
  );
};

export default SourcePlayer;
