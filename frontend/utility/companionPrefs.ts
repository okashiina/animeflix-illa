import { useSyncExternalStore } from 'react';

import { createStore } from './externalStore';

// Persona tone for the AI watch companion, persisted like the player prefs. The
// "unhinged" tone is explicit, so it stays behind the `mature` opt-in: a viewer
// has to switch that on before the companion ever talks that way.

export type CompanionTone =
  | 'adaptive'
  | 'analytical'
  | 'hype'
  | 'melancholic'
  | 'unhinged';

export interface CompanionPrefs {
  tone: CompanionTone;
  mature: boolean; // opt-in gate for the explicit "unhinged" tone
}

export interface ToneOption {
  id: CompanionTone;
  label: string;
  blurb: string;
  mature?: boolean;
}

// Order shown in the picker. Adaptive leads because it is the safest default.
export const COMPANION_TONES: ToneOption[] = [
  { id: 'adaptive', label: 'Adaptive', blurb: 'Matches your energy.' },
  { id: 'analytical', label: 'Analytical', blurb: 'Reads it deep.' },
  { id: 'hype', label: 'Hype buddy', blurb: 'Loud, fun, all jokes.' },
  { id: 'melancholic', label: 'Melancholic', blurb: 'Sits in the feels.' },
  {
    id: 'unhinged',
    label: 'Unhinged',
    blurb: 'Crude and unfiltered.',
    mature: true,
  },
];

export const toneLabel = (tone: CompanionTone): string =>
  COMPANION_TONES.find((t) => t.id === tone)?.label ?? 'Adaptive';

const KEY = 'kessoku.companion.v1';
const fallback: CompanionPrefs = { tone: 'adaptive', mature: false };

const store = createStore<CompanionPrefs>(KEY, fallback);

export const getCompanionPrefs = (): CompanionPrefs => store.get();
export const setTone = (tone: CompanionTone): void =>
  store.update((p) => ({ ...p, tone }));
export const setMature = (mature: boolean): void =>
  store.update((p) => ({ ...p, mature }));

// `fallback` is a stable reference, so getServerSnapshot never trips the
// "getSnapshot should be cached" loop during SSR.
export const useCompanionPrefs = (): CompanionPrefs =>
  useSyncExternalStore(store.subscribe, store.get, () => fallback);
