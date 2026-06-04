import { useEffect, useRef } from 'react';

import { getSession, subscribeAuth } from '@utility/anilistAuth';
import {
  isApplyingRemote,
  pullAndMerge,
  pushChanges,
} from '@utility/anilistSync';
import { subscribeStatus } from '@utility/listStatus';
import { subscribeProgress } from '@utility/progress';
import { subscribeWatchlist } from '@utility/watchlist';

const PUSH_DEBOUNCE_MS = 800;

// App-wide AniList sync driver, mounted once in _app. On login it pulls the
// user's list and merges it locally; thereafter it debounce-pushes local
// watchlist / progress changes back up. Entirely best-effort and no-op when
// logged out.
const useAniListSync = (): void => {
  const pulledFor = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Pull once per logged-in user (re-runs if the session changes).
    const maybePull = () => {
      const s = getSession();
      if (!s) {
        pulledFor.current = null;
        return;
      }
      if (pulledFor.current !== s.user.id) {
        pulledFor.current = s.user.id;
        pullAndMerge(s).catch(() => {
          /* best-effort */
        });
      }
    };

    const onLocalChange = () => {
      if (!getSession() || isApplyingRemote()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = getSession();
        if (s && !isApplyingRemote()) {
          pushChanges(s).catch(() => {
            /* best-effort */
          });
        }
      }, PUSH_DEBOUNCE_MS);
    };

    maybePull();
    const unsubAuth = subscribeAuth(maybePull);
    const unsubProgress = subscribeProgress(onLocalChange);
    const unsubWatchlist = subscribeWatchlist(onLocalChange);
    const unsubStatus = subscribeStatus(onLocalChange);

    return () => {
      if (timer) clearTimeout(timer);
      unsubAuth();
      unsubProgress();
      unsubWatchlist();
      unsubStatus();
    };
  }, []);
};

export default useAniListSync;
