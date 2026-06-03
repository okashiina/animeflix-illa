import { useSyncExternalStore } from 'react';

import { inWatchlist, subscribeWatchlist } from '@utility/watchlist';

// Whether one anime is in the watchlist, live across components/tabs. The snapshot is
// a boolean (stable by value), so no caching is needed; SSR returns false.
const useInWatchlist = (id: number): boolean =>
  useSyncExternalStore(
    subscribeWatchlist,
    () => inWatchlist(id),
    () => false
  );

export default useInWatchlist;
