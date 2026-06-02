import type { Provider, WatchParams, ResolveResult } from '../types.js';

// AllAnime (allmanga) provider — Miruro's "ally" source. Most promising target.
//
// STUB. Real extractor is implemented in Phase 1 with /web-scraping + /playwright-cli
// and validated against the live API (it is Cloudflare-gated, so calls go through
// FlareSolverr — see fetcher.ts `solver: true`). Reference (ani-cli method):
//   API:      https://api.allanime.day/api   (GraphQL-ish, persisted queries)
//   Referer:  https://allmanga.to
//   Flow:     search(title) -> show id -> episodes -> sourceUrls -> decode -> m3u8
//
// Until implemented it returns null, so the resolver falls through to the next
// provider and ultimately to embed fallback. The service stays healthy meanwhile.

export const allanime: Provider = {
  id: 'allanime',
  async resolve(_params: WatchParams): Promise<ResolveResult | null> {
    // TODO(phase1): search by title, map episode, extract + decode m3u8 via solver.
    return null;
  },
};
