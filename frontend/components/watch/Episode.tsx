import React, { useEffect, useRef, useState } from 'react';

import type { FillerKind } from '@animeflix/api';
import { CheckCircleIcon } from '@heroicons/react/solid';

import useWatchedEpisodes from '@hooks/useWatchedEpisodes';
import { setEpisode } from '@slices/episode';
import { useDispatch, useSelector } from '@store/store';
import { markWatched, unmarkWatched } from '@utility/progress';

// Only the "notable" kinds get a marker bar; the canon majority stays unmarked
// so filler/mixed actually stand out at a glance.
const BAR_COLOR: Record<FillerKind, string> = {
  canon: '',
  filler: 'bg-amber-400',
  mixed: 'bg-violet-400',
  'anime-canon': 'bg-sky-400',
};

const KIND_LABEL: Record<FillerKind, string> = {
  canon: 'Manga canon',
  filler: 'Filler',
  mixed: 'Mixed canon/filler',
  'anime-canon': 'Anime canon',
};

const LEGEND: FillerKind[] = ['filler', 'mixed', 'anime-canon'];

export interface PageButtonProps {
  start: number;
  end: number;
  active: boolean;
  onClick: () => void;
}

const PageButton: React.FC<PageButtonProps> = ({
  start,
  end,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`rounded-lg border px-3 py-1 text-sm tabular-nums transition duration-150 active:scale-95 ${
      active
        ? 'border-transparent bg-aurora font-semibold text-accent-ink'
        : 'border-line/70 bg-surface text-muted hover:bg-surface-2 hover:text-fg'
    }`}
  >
    {start}-{end}
  </button>
);

const GoToEpisode: React.FC = () => {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Go to</span>
      <input
        ref={inputRef}
        inputMode="numeric"
        className="w-24 rounded-lg border border-line/70 bg-surface px-3 py-1.5 text-sm text-fg placeholder-faint outline-none transition focus:border-accent/70"
        placeholder="Ep no."
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const value = parseInt(inputRef.current.value, 10);
          if (!Number.isNaN(value)) dispatch(setEpisode(value));
          inputRef.current.value = '';
        }}
      />
    </div>
  );
};

export interface EpisodeProps {
  /** Primary lookup title for filler data (AniList romaji works best). */
  title?: string;
  /** Secondary title tried if the primary finds nothing (English). */
  altTitle?: string;
}

const Episode: React.FC<EpisodeProps> = ({ title, altTitle }) => {
  const episodes = useSelector((store) => store.gogoApi.totalEpisodes);
  const current = useSelector((store) => store.episode.episode);
  const animeId = useSelector((store) => store.anime.anime);
  const dispatch = useDispatch();

  // Live set of episodes the viewer has finished (or hand-marked).
  const watched = new Set(useWatchedEpisodes(animeId));

  // Toggle a single episode's watched state. Auto-set when the player nears the
  // end of an episode; this is the manual override (long-press / right-click).
  const toggle = (v: number) => {
    if (watched.has(v)) unmarkWatched(animeId, v);
    else markWatched(animeId, v, { total: episodes });
  };

  // ~500ms press-and-hold to toggle watched, the touch-friendly twin of the
  // right-click menu. Cancelled if the finger lifts, leaves, or drifts.
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = undefined;
    }
  };
  useEffect(() => clearPress, []);

  const [currentPage, setPage] = useState(1);
  const [filler, setFiller] = useState<Record<number, FillerKind>>({});

  // Pull filler/canon classification client-side so the watch page's SSR is
  // never blocked on the third-party scrape. Purely decorative — failures are
  // swallowed and the grid simply renders unmarked.
  useEffect(() => {
    if (!title) return undefined;
    let active = true;

    const params = new URLSearchParams({ title });
    if (altTitle && altTitle !== title) params.set('alt', altTitle);

    fetch(`/api/filler?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (active) setFiller(data ?? {});
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [title, altTitle]);

  const hasMarks = Object.values(filler).some((k) => k !== 'canon');

  // 100 episodes per page.
  const pages = Math.ceil(episodes / 100);
  const episodeArray = Array.from({ length: episodes }, (_, i) => i + 1);

  if (!episodes) {
    return (
      <div className="mt-6">
        <GoToEpisode />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-lg font-bold text-fg">Episodes</h2>
        <span className="text-sm text-faint">{episodes} total</span>
        <div className="ml-auto">
          <GoToEpisode />
        </div>
      </div>

      {hasMarks && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          {LEGEND.map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span
                className={`h-[3px] w-3 rounded-full ${BAR_COLOR[kind]}`}
                aria-hidden
              />
              {KIND_LABEL[kind]}
            </span>
          ))}
          <span className="text-faint">Unmarked = canon</span>
        </div>
      )}

      <p className="mb-3 text-xs text-faint">
        Long-press or right-click an episode to mark it watched.
      </p>

      {pages > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {new Array(pages).fill(1).map((_v, i) => (
            <PageButton
              key={i + 1}
              start={i * 100 + 1}
              end={i * 100 + 100 > episodes ? episodes : i * 100 + 100}
              active={currentPage === i + 1}
              onClick={() => setPage(i + 1)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
        {episodeArray
          .slice((currentPage - 1) * 100, currentPage * 100)
          .map((v) => {
            const kind = filler[v];
            const bar = kind ? BAR_COLOR[kind] : '';
            const isCurrent = v === current;
            const isWatchedEp = watched.has(v);
            let epTitle: string | undefined;
            if (kind) {
              epTitle = `${KIND_LABEL[kind]}${isWatchedEp ? ' · watched' : ''}`;
            } else if (isWatchedEp) {
              epTitle = 'Watched';
            }
            const startPress = () => {
              clearPress();
              pressTimer.current = setTimeout(() => {
                clearPress();
                toggle(v);
              }, 500);
            };
            return (
              <button
                key={v}
                onClick={() => dispatch(setEpisode(v))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggle(v);
                }}
                onPointerDown={startPress}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerMove={clearPress}
                aria-current={isCurrent}
                title={epTitle}
                className={`relative flex h-10 items-center justify-center rounded-md text-sm tabular-nums transition duration-150 active:scale-95 ${
                  isCurrent
                    ? 'bg-aurora font-semibold text-accent-ink shadow-glow'
                    : `bg-surface text-muted hover:bg-surface-2 hover:text-fg ${
                        isWatchedEp ? 'opacity-60 ring-1 ring-accent/40' : ''
                      }`
                }`}
              >
                {v}
                {isWatchedEp && (
                  <CheckCircleIcon
                    className={`absolute right-0.5 top-0.5 h-3.5 w-3.5 ${
                      isCurrent ? 'text-accent-ink/90' : 'text-accent'
                    }`}
                    aria-hidden
                  />
                )}
                {bar && (
                  <span
                    className={`absolute inset-x-1.5 bottom-1 h-[3px] rounded-full ${bar}`}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
};

export default Episode;
