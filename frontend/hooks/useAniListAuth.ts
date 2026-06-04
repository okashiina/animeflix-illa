import { useSyncExternalStore } from 'react';

import {
  getSession,
  login,
  logout,
  subscribeAuth,
  type AniListSession,
} from '@utility/anilistAuth';

interface AuthState {
  session: AniListSession | null;
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
}

// Live AniList session, stable across components/tabs. SSR returns logged-out,
// then hydrates (same pattern as the watchlist hooks).
const useAniListAuth = (): AuthState => {
  const session = useSyncExternalStore(subscribeAuth, getSession, () => null);
  return { session, isLoggedIn: session !== null, login, logout };
};

export default useAniListAuth;
