import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/solid';

import useInWatchlist from '@hooks/useInWatchlist';
import { toggleWatchlist } from '@utility/watchlist';

export interface WatchlistButtonProps {
  id: number;
  variant?: 'icon' | 'labeled';
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
