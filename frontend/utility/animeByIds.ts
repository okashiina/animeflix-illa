import { getAnimeByIds } from '@animeflix/api';
import { AnimeInfoFragment } from '@animeflix/api/aniList';

// AniList's Page(perPage) is capped at 50 server-side, and `media(id_in: [...])`
// returns matches sorted by media id ascending — it ignores the order you pass.
// The old call sites used `getAnimeByIds({ perPage: 30, page: 1, ids })`, which
// silently (a) dropped everything past 30 and (b) kept the 30 LOWEST ids, so a
// list bigger than 30 lost its newer (higher-id) titles entirely.
//
// This resolves any number of ids and returns them in the input order. Three
// things keep it from hammering AniList's rate limit (which returns 429 and, if
// tripped, blanks every rail at once):
//   1. A module-level cache: a title is fetched once, then reused. Removing one
//      item from a list re-renders with ZERO new requests (everything else is
//      already cached) instead of refetching the whole list.
//   2. In-flight de-duplication: the three rails (Continue / My List / Watch
//      Later) mount together and ask for overlapping ids; each id is fetched by
//      exactly one request, the others await it.
//   3. Serialized batches with 429 back-off: chunks of 50 go out one at a time,
//      and a 429 is retried with a short delay rather than swallowed into an
//      empty result that wipes the UI.

const CHUNK = 50;

const cache = new Map<number, AnimeInfoFragment>();
const inflight = new Map<number, Promise<void>>();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// One global chain so all batches from this helper go out sequentially, never as
// a simultaneous burst — the single biggest cause of the 429 cascade.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

const statusOf = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } } | undefined)?.response?.status;

const loadChunk = async (ids: number[], attempt = 0): Promise<void> => {
  try {
    const data = await getAnimeByIds({ perPage: CHUNK, page: 1, ids });
    (data.Page?.media ?? []).forEach((anime) => {
      if (anime) cache.set(anime.id, anime);
    });
  } catch (err) {
    // Back off on rate-limit (and other transient errors) a few times. Leaving
    // ids uncached on final failure lets a later render retry them.
    if (attempt < 3 && (statusOf(err) === 429 || statusOf(err) === undefined)) {
      await sleep(1200 * (attempt + 1));
      await loadChunk(ids, attempt + 1);
    }
  }
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Full media for any number of AniList ids, in the same order as `ids`. */
export const getAllAnimeByIds = async (
  ids: number[]
): Promise<AnimeInfoFragment[]> => {
  if (ids.length === 0) return [];

  // Only fetch ids we neither hold nor are already fetching.
  const need = ids.filter((id) => !cache.has(id) && !inflight.has(id));
  chunk(need, CHUNK).forEach((part) => {
    const p = enqueue(() => loadChunk(part)).finally(() =>
      part.forEach((id) => inflight.delete(id))
    );
    part.forEach((id) => inflight.set(id, p));
  });

  // Wait on whatever in-flight request now covers our ids (dedup across rails).
  const waits = new Set<Promise<void>>();
  ids.forEach((id) => {
    const p = inflight.get(id);
    if (p) waits.add(p);
  });
  await Promise.all(Array.from(waits));

  return ids
    .map((id) => cache.get(id))
    .filter((m): m is AnimeInfoFragment => Boolean(m));
};
