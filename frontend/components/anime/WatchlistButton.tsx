import {
  BookmarkIcon as BookmarkOutlineIcon,
  ClockIcon,
} from '@heroicons/react/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/solid';

import useInWatchlist from '@hooks/useInWatchlist';
import { setExplicitStatus } from '@utility/listStatus';
import { toggleWatchlist } from '@utility/watchlist';

export interface WatchlistButtonProps {
  id: number;
  // 'planning' is a quick "Watch Later" action: it marks the title PLANNING
  // (which also adds it to the list). Opt-in only — existing call sites keep
  // their bookmark toggle behaviour.
  variant?: 'icon' | 'labeled' | 'planning';
  className?: string;
}

// Save/remove a title from "My List". Local-only (no auth) — backed by the
// watchlist external store, so every mounted button stays in sync live.
const WatchlistButton: React.FC<WatchlistButtonProps> = ({
  id,
  variant = 'icon',
  className = '',
}) => {
  const inList = useInWatchlist(id);

  // Card overlays render this inside an <a>, so swallow the click before it
  // navigates. Harmless on the standalone labeled buttons too.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(id);
  };

  const ariaLabel = inList ? 'Remove from My List' : 'Add to My List';

  // Quick "Watch Later": mark PLANNING (which also pulls it onto the list).
  const handlePlanClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExplicitStatus(id, 'PLANNING');
  };

  if (variant === 'planning') {
    return (
      <button
        type="button"
        onClick={handlePlanClick}
        aria-label="Add to Watch Later"
        className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-semibold text-fg transition duration-200 ease-out hover:bg-surface-2 active:scale-95 ${className}`}
      >
        <ClockIcon className="h-5 w-5" aria-hidden />
        Watch Later
      </button>
    );
  }

  if (variant === 'labeled') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={inList}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition duration-200 ease-out active:scale-95 ${
          inList
            ? 'bg-aurora text-accent-ink shadow-glow hover:brightness-110'
            : 'border border-line bg-surface text-fg hover:bg-surface-2'
        } ${className}`}
      >
        {inList ? (
          <>
            <BookmarkSolidIcon className="h-5 w-5" aria-hidden />
            In My List
          </>
        ) : (
          <>
            <BookmarkOutlineIcon className="h-5 w-5" aria-hidden />
            My List
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={inList}
      aria-label={ariaLabel}
      className={`bg-canvas/65 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition duration-200 hover:bg-canvas/80 ${
        inList ? 'text-accent' : 'text-fg'
      } ${className}`}
    >
      {inList ? (
        <BookmarkSolidIcon className="h-4 w-4" aria-hidden />
      ) : (
        <BookmarkOutlineIcon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
};

export default WatchlistButton;
