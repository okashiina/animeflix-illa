import { useEffect, useRef, useState } from 'react';

import { setDub, setProvider } from '@store/slices/videoSettings';
import { useDispatch, useSelector } from '@store/store';
import {
  embedProviders,
  getProvider,
  rememberedProvider,
  rememberProvider,
} from '@utility/embedProviders';

// How long to wait for the iframe's onLoad before assuming the server is slow
// or blocked. We can't read a cross-origin iframe, so this is a heuristic only.
const LOAD_TIMEOUT_MS = 11000;

// localStorage key for the dub flag (provider is reconciled by the slice).
const DUB_KEY = 'videoSettings.useDub';

const EmbedPlayer: React.FC = () => {
  const dispatch = useDispatch();
  const [animeId, episode] = useSelector((store) => [
    store.anime.anime,
    store.episode.episode,
  ]);
  const { useDub, provider } = useSelector((store) => store.videoSettings);

  // Once the user manually picks a server for this title, stop auto-advancing —
  // their choice wins. Reset per title. Counts auto-advances so we cycle the
  // provider list at most once before falling back to the manual UI.
  const userPickedRef = useRef(false);
  const attemptsRef = useRef(0);

  // Reconcile the dub flag with any saved choice once on mount (SSR-safe —
  // effects never run on the server). Provider is initialised by the slice.
  useEffect(() => {
    try {
      const savedDub = window.localStorage.getItem(DUB_KEY);
      if (savedDub !== null) dispatch(setDub(savedDub === 'true'));
    } catch {
      /* localStorage unavailable — keep SSR defaults. */
    }
    // Intentionally run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On each new title, reset the user's override and prefer a server we've
  // previously seen carry THIS title (else keep the user's global pick).
  useEffect(() => {
    userPickedRef.current = false;
    const remembered = rememberedProvider(animeId);
    if (remembered && remembered !== provider)
      dispatch(setProvider(remembered));
    // Only react to a title change; `provider` is read as the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animeId]);

  // Fresh auto-advance budget for every episode (and title), so a stalled later
  // episode can still cycle servers.
  useEffect(() => {
    attemptsRef.current = 0;
  }, [animeId, episode]);

  const src = getProvider(provider).build(animeId, episode, useDub);

  // Timeout heuristic: assume the player is stalled until onLoad fires.
  const [stalled, setStalled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const advanceProvider = () => {
    const currentIndex = embedProviders.findIndex((p) => p.id === provider);
    const next =
      embedProviders[(currentIndex + 1) % embedProviders.length] ??
      embedProviders[0];
    dispatch(setProvider(next.id));
  };

  // Manual server pick (chips / "try another") — pauses auto-advance for the title.
  const pickProvider = (id: string) => {
    userPickedRef.current = true;
    attemptsRef.current = 0;
    setStalled(false);
    dispatch(setProvider(id));
  };

  const tryAnotherManually = () => {
    userPickedRef.current = true;
    setStalled(false);
    advanceProvider();
  };

  // Reset the stall timer whenever the src changes (provider/episode/dub).
  // On timeout, auto-advance through the list once; only after exhausting it do
  // we surface the manual "try another server" UI.
  useEffect(() => {
    setStalled(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (
        !userPickedRef.current &&
        attemptsRef.current < embedProviders.length - 1
      ) {
        attemptsRef.current += 1;
        advanceProvider();
      } else {
        setStalled(true);
      }
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // advanceProvider is recreated each render but reads current state; we only
    // want to reset the timer when the src changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const handleLoad = () => {
    // onLoad fires once the iframe document loads. We cannot tell whether the
    // provider found the episode (cross-origin), only that *something* loaded —
    // so remembering the server for this title is best-effort.
    if (timerRef.current) clearTimeout(timerRef.current);
    setStalled(false);
    rememberProvider(animeId, provider);
  };

  return (
    <div className="space-y-2.5">
      {/* NOTE: this project disables Tailwind's core aspectRatio plugin
          (corePlugins.aspectRatio = false) and uses @tailwindcss/aspect-ratio
          instead, so the ratio box must use `aspect-w-* / aspect-h-*`, not
          `aspect-video`. The plugin absolutely-positions the direct child. */}
      <div className="aspect-w-16 aspect-h-9 relative w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
        <iframe
          key={src}
          src={src}
          title="Anime video player"
          className="border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
        />

        {stalled && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas/80 px-6 text-center backdrop-blur-sm">
            <p className="max-w-xs text-sm text-muted">
              <span className="font-semibold text-fg">
                {getProvider(provider).name}
              </span>{' '}
              is slow or blocked. Try another server.
            </p>
            <button
              type="button"
              onClick={tryAnotherManually}
              className="rounded-lg bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition active:scale-95"
            >
              Try another server
            </button>
          </div>
        )}
      </div>

      {/* Quick provider switcher — complements the dropdown in WatchControls. */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Video server"
      >
        <span className="mr-0.5 text-xs font-medium uppercase tracking-wide text-faint">
          Server
        </span>
        {embedProviders.map((p) => {
          const active = p.id === provider;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProvider(p.id)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-medium transition duration-150 active:scale-95 ${
                active
                  ? 'bg-aurora text-accent-ink shadow-glow'
                  : 'border border-line/70 bg-surface text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-faint">
        Not playing? Some servers don&apos;t carry every title or episode. Try
        another server above.
      </p>
    </div>
  );
};

export default EmbedPlayer;
