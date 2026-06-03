import { useSyncExternalStore } from 'react';

import {
  CONTINUE_EMPTY,
  listContinue,
  subscribeProgress,
  type ContinueItem,
} from '@utility/progress';

// Live "Continue watching" list (most-recent-first). SSR returns a stable empty
// array, then hydrates to real data — no mismatch (the rail is client-only anyway).
const useWatchHistory = (): ContinueItem[] =>
  useSyncExternalStore(subscribeProgress, listContinue, () => CONTINUE_EMPTY);

export default useWatchHistory;
