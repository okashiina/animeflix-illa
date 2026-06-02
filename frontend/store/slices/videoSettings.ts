/* eslint-disable no-param-reassign */
import { createSlice, Draft, PayloadAction } from '@reduxjs/toolkit';

import { defaultProviderId, getProvider } from '@utility/embedProviders';

export interface VideoSettingsState {
  useDub: boolean;
  useProxy: boolean;
  provider: string;
}

const PROVIDER_KEY = 'videoSettings.provider';
const DUB_KEY = 'videoSettings.useDub';

// SSR-safe localStorage helpers. These never touch `window` at module load on
// the server — the guards are evaluated lazily, only when the helpers run.
const readProvider = (): string => {
  if (typeof window === 'undefined') return defaultProviderId;
  try {
    const saved = window.localStorage.getItem(PROVIDER_KEY);
    // Validate against the live provider list so a stale/removed id falls back.
    if (saved && getProvider(saved).id === saved) return saved;
  } catch {
    /* localStorage may be unavailable (private mode, blocked) — ignore. */
  }
  return defaultProviderId;
};

const readDub = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DUB_KEY) === 'true';
  } catch {
    return false;
  }
};

const persist = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore write failures (quota, blocked storage). */
  }
};

const initialState: VideoSettingsState = {
  useDub: readDub(),
  useProxy: false,
  provider: readProvider(),
};

export const videoSettingsSlice = createSlice({
  name: 'videoSettings',
  initialState,
  reducers: {
    toggleProxy: (state: Draft<VideoSettingsState>) => {
      state.useProxy = !state.useProxy;
    },
    toggleDub: (state: Draft<VideoSettingsState>) => {
      state.useDub = !state.useDub;
      persist(DUB_KEY, String(state.useDub));
    },
    setProxy: (
      state: Draft<VideoSettingsState>,
      action: PayloadAction<boolean>
    ) => {
      state.useProxy = action.payload;
    },
    setDub: (
      state: Draft<VideoSettingsState>,
      action: PayloadAction<boolean>
    ) => {
      state.useDub = action.payload;
      persist(DUB_KEY, String(state.useDub));
    },
    setProvider: (
      state: Draft<VideoSettingsState>,
      action: PayloadAction<string>
    ) => {
      state.provider = action.payload;
      persist(PROVIDER_KEY, state.provider);
    },
  },
});

export const { setDub, setProxy, setProvider, toggleDub, toggleProxy } =
  videoSettingsSlice.actions;

export default videoSettingsSlice.reducer;
