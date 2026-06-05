import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import Section from '@components/anime/Section';
import useWatchlist from '@hooks/useWatchlist';
import { getAllAnimeByIds } from '@utility/animeByIds';
import { effectiveStatus, subscribeStatus } from '@utility/listStatus';
import { subscribeProgress } from '@utility/progress';
import { subscribeWatchlist } from '@utility/watchlist';

// "Watch Later" rail: every saved title still sitting in PLANNING. Mirrors
// MyListRail (same watchlist source + getAnimeByIds fetch + Section render),
// then filters to the effective list status. The PLANNING set depends on the
// status, progress, and watchlist stores, so we subscribe to all three and
// recompute when any of them change. SSR returns an empty set so the snapshot
// is stable and nothing renders on the server.
const subscribeAll = (cb: () => void): (() => void) => {
  const unsubs = [
    subscribeStatus(cb),
    subscribeProgress(cb),
    subscribeWatchlist(cb),
  ];
  return () => unsubs.forEach((u) => u());
};

const EMPTY_PLANNING = '';

const WatchLaterRail: React.FC = () => {
  const ids = useWatchlist();
  const [media, setMedia] = useState<AnimeInfoFragment[]>([]);

  const idKey = ids.join(',');

  useEffect(() => {
    const list = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;

    if (list.length === 0) {
      setMedia([]);
    } else {
      // Already ordered to match `list` (most-recent-first), no 30-cap.
      getAllAnimeByIds(list)
        .then((resolved) => {
          if (!cancelled) setMedia(resolved);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  // A primitive snapshot of the PLANNING ids (comma-joined) so the value stays
  // referentially stable for useSyncExternalStore and only changes when the
  // PLANNING set actually does.
  const planningKey = useSyncExternalStore(
    subscribeAll,
    () =>
      idKey
        .split(',')
        .filter(Boolean)
        .filter((id) => effectiveStatus(Number(id)) === 'PLANNING')
        .join(','),
    () => EMPTY_PLANNING
  );

  const planning = useMemo(() => {
    const allow = new Set(planningKey.split(',').filter(Boolean));
    return media.filter((anime) => allow.has(String(anime.id)));
  }, [media, planningKey]);

  if (planning.length === 0) return null;

  return <Section title="Watch Later" animeList={planning} />;
};

export default WatchLaterRail;
