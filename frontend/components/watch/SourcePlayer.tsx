import { useCallback, useEffect, useRef, useState } from 'react';

import { useSelector } from '@store/store';

import EmbedPlayer from './EmbedPlayer';

// Our self-hosted source pipeline (Option B). When NEXT_PUBLIC_SOURCE_SERVICE_URL
// is set (local dev / a VPS), we ask it to resolve a real m3u8 (AnimePahe via
// FlareSolverr, proxied through /hls) and play it with hls.js — with quality
// selection. If it isn't set, resolving fails, or the user prefers it, we fall
// back to the third-party embed switcher. The two are switchable both ways.

const SOURCE_SERVICE = process.env.NEXT_PUBLIC_SOURCE_SERVICE_URL;

interface Source {
  url: string;
  quality?: string;
}
interface WatchResponse {
  mode: 'direct' | 'embed';
  provider?: string;
  sources?: Source[];
}

const HlsVideo: React.FC<{ src: string }> = ({ src }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;

    let destroyed = false;
    let hls: { destroy: () => void } | null = null;

    // Prefer hls.js (Chrome/Edge/Firefox); native HLS only where it can't run
    // (Safari). Chromium's canPlay('mpegurl') lies, so don't check it first.
    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !ref.current) return;
      if (Hls.isSupported()) {
        const instance = new Hls({ enableWorker: true });
        instance.on(
          Hls.Events.ERROR,
          (
            _e: unknown,
            data: { type: string; details: string; fatal: boolean }
          ) => {
            // eslint-disable-next-line no-console
            console.error(
              '[hls]',
              data.type,
              data.details,
              data.fatal ? 'FATAL' : ''
            );
          }
        );
        instance.loadSource(src);
        instance.attachMedia(ref.current);
        hls = instance;
      } else if (ref.current.canPlayType('application/vnd.apple.mpegurl')) {
        ref.current.src = src;
      }
    });

    return () => {
      destroyed = true;
      if (hls) hls.destroy();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      controls
      autoPlay
      playsInline
      className="h-full w-full bg-black"
    />
  );
};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
    {children}
  </div>
);

const SourcePlayer: React.FC<{ titles: string[] }> = ({ titles }) => {
  const animeId = useSelector((store) => store.anime.anime);
  const episode = useSelector((store) => store.episode.episode);
  const useDub = useSelector((store) => store.videoSettings.useDub);

  const [phase, setPhase] = useState<'loading' | 'direct' | 'embed'>(
    SOURCE_SERVICE ? 'loading' : 'embed'
  );
  const [sources, setSources] = useState<Source[]>([]);
  const [provider, setProvider] = useState('');
  const [qIdx, setQIdx] = useState(0);

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
    setQIdx(0);

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

  // ---- Embed view (manual fallback or resolve failure) ----
  if (phase === 'embed') {
    return (
      <div className="space-y-2.5">
        <EmbedPlayer />
        <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
          <button
            type="button"
            onClick={() => (hasOurPlayer ? setPhase('direct') : resolve())}
            className="rounded-full bg-aurora px-3 py-1 font-semibold text-accent-ink shadow-glow transition active:scale-95"
          >
            {hasOurPlayer ? '↺ Switch to our player (HD)' : '↺ Try our server'}
          </button>
          <span>or pick a third-party server above</span>
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
    <div className="space-y-2.5">
      <Frame>
        <HlsVideo src={sources[qIdx]?.url} />
      </Frame>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-aurora px-2.5 py-1 font-semibold text-accent-ink shadow-glow">
          ▶ our player{provider ? ` · ${provider}` : ''}
        </span>

        {sources.length > 1 && (
          <span className="flex items-center gap-1 rounded-full border border-line/70 bg-surface px-1 py-0.5">
            <span className="px-1.5 text-faint">Quality</span>
            {sources.map((s, i) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={`${s.quality}-${i}`}
                type="button"
                onClick={() => setQIdx(i)}
                className={`rounded-full px-2 py-0.5 font-medium transition ${
                  i === qIdx
                    ? 'bg-accent text-accent-ink'
                    : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {s.quality || 'auto'}
              </button>
            ))}
          </span>
        )}

        <button
          type="button"
          onClick={() => setPhase('embed')}
          className="rounded-full border border-line/70 bg-surface px-2.5 py-1 font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          Use embed instead
        </button>
      </div>
    </div>
  );
};

export default SourcePlayer;
