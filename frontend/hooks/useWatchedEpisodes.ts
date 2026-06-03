import { useSyncExternalStore } from 'react';

import { getEntry, subscribeProgress } from '@utility/progress';

// Live set of watched episode numbers for one anime. The `watched` array reference is
// stable until a write (the store snapshot is cached), so it's a safe getSnapshot.
const EMPTY: number[] = [];
const useWatchedEpisodes = (id: number): number[] =>
  useSyncExternalStore(
    subscribeProgress,
    () => getEntry(id)?.watched ?? EMPTY,
    () => EMPTY
  );

export default useWatchedEpisodes;
