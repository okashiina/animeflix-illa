import { useEffect, useRef, useState } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import ContinueWatchingCard from '@components/anime/ContinueWatchingCard';
import useWatchHistory from '@hooks/useWatchHistory';
import { getAllAnimeByIds } from '@utility/animeByIds';

const ContinueWatchingRail: React.FC = () => {
  const items = useWatchHistory();
  const railRef = useRef<HTMLDivElement>(null);
  const [animeById, setAnimeById] = useState<Record<number, AnimeInfoFragment>>(
    {}
  );

  const idKey = items.map((item) => item.id).join(',');

  useEffect(() => {
    const ids = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;

    if (ids.length > 0) {
      // No 30-cap: resolve every in-progress title so a large synced list
      // doesn't crowd out (or drop) the genuinely most-recent watches.
      getAllAnimeByIds(ids)
        .then((media) => {
          if (cancelled) return;
          const next: Record<number, AnimeInfoFragment> = {};
          media.forEach((anime) => {
            next[anime.id] = anime;
          });
          setAnimeById(next);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  if (items.length === 0) return null;

  const cards = items
    .map((item) => ({ item, anime: animeById[item.id] }))
    .filter((row) => row.anime);

  if (cards.length === 0) return null;

  return (
    <section className="mt-10 first:mt-8">
      <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Continue watching
        </h2>
      </div>

      <div className="edge-fade-x">
        <div
          tabIndex={0}
          ref={railRef}
          onMouseEnter={() => railRef.current?.focus()}
          className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 outline-none scrollbar-hide sm:px-6 lg:px-8"
        >
          {cards.map(({ item, anime }) => (
            <ContinueWatchingCard
              key={item.id}
              anime={anime}
              entry={item.entry}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContinueWatchingRail;
