/* eslint-disable no-param-reassign */
import { createSlice, Draft, PayloadAction } from '@reduxjs/toolkit';

import { defaultProviderId } from '@utility/embedProviders';

export interface VideoSettingsState {
  useDub: boolean;
  useProxy: boolean;
  provider: string;
}

const initialState: VideoSettingsState = {
  useDub: false,
  useProxy: false,
  provider: defaultProviderId,
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
    },
    setProvider: (
      state: Draft<VideoSettingsState>,
      action: PayloadAction<string>
    ) => {
      state.provider = action.payload;
    },
  },
});

export const { setDub, setProxy, setProvider, toggleDub, toggleProxy } =
  videoSettingsSlice.actions;

export default videoSettingsSlice.reducer;
