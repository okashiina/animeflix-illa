// Intro/outro skip markers from the community AniSkip API, keyed by MAL id +
// episode number. Free, public, CORS-open. Tolerant of 404 (no markers for a
// title/episode) — callers just render no Skip button. Results are memoised for
// the session so re-opening the same episode doesn't refetch.

export interface SkipInterval {
  start: number; // seconds
  end: number;
}

export interface SkipMarkers {
  op?: SkipInterval; // opening / intro
  ed?: SkipInterval; // ending / outro
}

const cache = new Map<string, SkipMarkers>();

interface AniSkipResult {
  interval?: { startTime?: number; endTime?: number };
  skipType?: string;
}

export const fetchSkipMarkers = async (
  malId: number,
  episode: number,
  signal?: AbortSignal
): Promise<SkipMarkers> => {
  if (!malId || !episode) return {};

  const key = `${malId}:${episode}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const url =
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}` +
      '?types=op&types=ed&episodeLength=0';
    const res = await fetch(url, { signal });
    if (!res.ok) {
      cache.set(key, {});
      return {};
    }

    const json = await res.json();
    const markers: SkipMarkers = {};
    const results: AniSkipResult[] = Array.isArray(json?.results)
      ? json.results
      : [];

    results.forEach((r) => {
      const iv = r.interval;
      if (
        !iv ||
        typeof iv.startTime !== 'number' ||
        typeof iv.endTime !== 'number'
      )
        return;
      const interval: SkipInterval = { start: iv.startTime, end: iv.endTime };
      if (r.skipType === 'op') markers.op = interval;
      else if (r.skipType === 'ed') markers.ed = interval;
    });

    cache.set(key, markers);
    return markers;
  } catch (err) {
    // A superseded request was aborted — don't cache an empty result for it.
    if ((err as Error)?.name === 'AbortError') return {};
    cache.set(key, {});
    return {};
  }
};
