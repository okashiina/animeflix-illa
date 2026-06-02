import type { Provider, WatchParams, ResolveResult } from '../types.js';

// AnimePahe provider — Miruro's "kiwi" source. Hardsubbed, kwik extractor.
//
// STUB. Real extractor in Phase 1 (uses DDoS-Guard cookies via FlareSolverr).
// Reference: https://animepahe.ru — search -> session id -> /api?m=release ->
// episode session -> /play -> kwik link -> extract m3u8.

export const animepahe: Provider = {
  id: 'animepahe',
  async resolve(_params: WatchParams): Promise<ResolveResult | null> {
    // TODO(phase1): implement via solver + kwik extractor.
    return null;
  },
};
