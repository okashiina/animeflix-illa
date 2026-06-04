import { useSyncExternalStore } from 'react';

import {
  effectiveStatus,
  subscribeStatus,
  type AniStatus,
} from '@utility/listStatus';
import { subscribeProgress } from '@utility/progress';
import { subscribeWatchlist } from '@utility/watchlist';

// Effective status depends on three stores (explicit status + progress +
// watchlist membership), so subscribe to all of them. The snapshot is a
// primitive, so it's stable by value; SSR returns null.
const subscribeAll = (cb: () => void): (() => void) => {
  const unsubs = [
    subscribeStatus(cb),
    subscribeProgress(cb),
    subscribeWatchlist(cb),
  ];
  return () => unsubs.forEach((u) => u());
};

const useEffectiveStatus = (id: number): AniStatus | null =>
  useSyncExternalStore(
    subscribeAll,
    () => effectiveStatus(id),
    () => null
  );

export default useEffectiveStatus;
