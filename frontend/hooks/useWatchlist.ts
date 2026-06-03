import { useSyncExternalStore } from 'react';

import {
  listWatchlistIds,
  subscribeWatchlist,
  WATCHLIST_EMPTY,
} from '@utility/watchlist';

// Live watchlist as an id array (most-recent-first). SSR-safe (empty on the server).
const useWatchlist = (): number[] =>
  useSyncExternalStore(
    subscribeWatchlist,
    listWatchlistIds,
    () => WATCHLIST_EMPTY
  );

export default useWatchlist;
