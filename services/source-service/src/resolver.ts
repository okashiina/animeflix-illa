import type { ResolveResult, WatchParams } from './types.js';
import { orderedProviders } from './providers/index.js';
import { isOpen, recordFailure, recordSuccess } from './circuitBreaker.js';
import { sourceCache, sourceKey } from './cache.js';

// Fallback chain (SOP #1 + #2): try providers in priority order, skipping any with
// an open breaker. First playable result wins and is cached. If none succeed the
// caller serves embed fallback so the site never goes dark.
export async function resolve(params: WatchParams): Promise<ResolveResult | null> {
  const key = sourceKey(params.anilistId, params.episode, params.category);
  const cached = sourceCache.get(key);
  if (cached) return cached;

  for (const provider of orderedProviders) {
    if (isOpen(provider.id)) continue;
    try {
      const result = await provider.resolve(params);
      if (result && result.sources.length > 0) {
        recordSuccess(provider.id);
        sourceCache.set(key, result);
        return result;
      }
      // "no source" is not a hard failure; just try the next provider.
    } catch {
      recordFailure(provider.id);
    }
  }
  return null;
}
