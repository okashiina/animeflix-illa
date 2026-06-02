import React, { useRef, useState } from 'react';

import { setEpisode } from '@slices/episode';
import { useDispatch, useSelector } from '@store/store';

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

const Episode: React.FC = () => {
  const episodes = useSelector((store) => store.gogoApi.totalEpisodes);
  const current = useSelector((store) => store.episode.episode);
  const dispatch = useDispatch();

  const [currentPage, setPage] = useState(1);

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
          .map((v) => (
            <button
              key={v}
              onClick={() => dispatch(setEpisode(v))}
              aria-current={v === current}
              className={`flex h-10 items-center justify-center rounded-md text-sm tabular-nums transition duration-150 active:scale-95 ${
                v === current
                  ? 'bg-aurora font-semibold text-accent-ink shadow-glow'
                  : 'bg-surface text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {v}
            </button>
          ))}
      </div>
    </div>
  );
};

export default Episode;
