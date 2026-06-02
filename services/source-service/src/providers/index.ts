import type { Provider } from '../types.js';
import { config } from '../config.js';
import { allanime } from './allanime.js';
import { animepahe } from './animepahe.js';

const registry: Record<string, Provider> = {
  [allanime.id]: allanime,
  [animepahe.id]: animepahe,
};

// Providers in the configured priority order (unknown ids are ignored).
export const orderedProviders: Provider[] = config.providers
  .map((id) => registry[id])
  .filter((p): p is Provider => Boolean(p));
