// Server-side episode-recap grounding via Kitsu. AniList has no per-episode
// synopses; Kitsu does, and its read endpoints need no key (the repo already
// talks to Kitsu elsewhere). The companion stays "lazy": nothing here runs until
// the viewer asks to look back, every public call is a SMALL bounded fetch, and
// module-level caches make repeat asks free (synopses are static). The CALLER
// clamps which episodes are allowed (only ones strictly before the viewer's
// current episode — never the current one or anything ahead), so this module
// never decides spoiler policy; it only fetches already-aired summaries.

const KITSU = 'https://kitsu.io/api/edge';

export interface KitsuEpisode {
  number: number;
  title: string;
  synopsis: string;
}

export interface RecapSource {
  title: string;
  year?: number;
}

interface KitsuAnimeAttrs {
  canonicalTitle?: string | null;
  subtype?: string | null;
  startDate?: string | null;
  synopsis?: string | null;
  description?: string | null;
}
interface KitsuEpisodeAttrs {
  number?: number | null;
  canonicalTitle?: string | null;
  synopsis?: string | null;
  description?: string | null;
}
interface KitsuItem<A> {
  id: string;
  attributes?: A | null;
}
interface KitsuList<A> {
  data?: KitsuItem<A>[] | null;
}
interface KitsuOne<A> {
  data?: KitsuItem<A> | null;
}

// Caches persist for the life of the server process (Next dev keeps the module
// warm; the Railway container is a long-running Node server) → re-asks are free.
const idCache = new Map<string, number | null>();
const epCache = new Map<string, KitsuEpisode | null>();
const synopsisCache = new Map<number, string | null>();

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

const kitsuFetch = async <T>(path: string): Promise<T | null> => {
  try {
    const res = await fetch(`${KITSU}${path}`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

// Resolve a title to its Kitsu anime id. Best TV match; a year breaks ties
// between seasons/recaps that share a title.
const resolveAnimeId = async (
  title: string,
  year?: number
): Promise<number | null> => {
  const key = `${norm(title)}|${year ?? ''}`;
  const cached = idCache.get(key);
  if (cached !== undefined) return cached;

  const data = await kitsuFetch<KitsuList<KitsuAnimeAttrs>>(
    `/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=5`
  );
  const list = data?.data ?? [];
  const score = (a: KitsuItem<KitsuAnimeAttrs>): number => {
    const at = a.attributes ?? {};
    let s = 0;
    if (at.subtype === 'TV' || at.subtype === 'movie') s += 2;
    if (year && at.startDate && at.startDate.slice(0, 4) === String(year))
      s += 3;
    if (at.canonicalTitle && norm(at.canonicalTitle) === norm(title)) s += 2;
    return s;
  };
  const best = [...list].sort((a, b) => score(b) - score(a))[0];
  const id = best ? Number(best.id) : null;
  idCache.set(key, id);
  return id;
};

const fetchEpisode = async (
  animeId: number,
  n: number
): Promise<KitsuEpisode | null> => {
  const key = `${animeId}:${n}`;
  const cached = epCache.get(key);
  if (cached !== undefined) return cached;

  const data = await kitsuFetch<KitsuList<KitsuEpisodeAttrs>>(
    `/anime/${animeId}/episodes?filter[number]=${n}`
  );
  const at = (data?.data ?? [])[0]?.attributes;
  const synopsis = (at?.synopsis || at?.description || '').trim();
  const result: KitsuEpisode | null = synopsis
    ? {
        number: n,
        title: at?.canonicalTitle?.trim() || '',
        synopsis: clip(synopsis, 500),
      }
    : null;
  epCache.set(key, result);
  return result;
};

/** One earlier episode's recap. The caller must pass an episode < current. */
export const recapEpisode = async (
  src: RecapSource,
  n: number
): Promise<KitsuEpisode | null> => {
  const id = await resolveAnimeId(src.title, src.year);
  if (!id) return null;
  return fetchEpisode(id, n);
};

/** Up to `count` episodes ending at `upTo` (inclusive), oldest first. Bounded. */
export const recapEpisodes = async (
  src: RecapSource,
  upTo: number,
  count: number
): Promise<KitsuEpisode[]> => {
  const id = await resolveAnimeId(src.title, src.year);
  if (!id || upTo < 1) return [];
  const from = Math.max(1, upTo - count + 1);
  const out: KitsuEpisode[] = [];
  for (let n = from; n <= upTo; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ep = await fetchEpisode(id, n);
    if (ep) out.push(ep);
  }
  return out;
};

/** A series' overall premise (used to unlock a prequel without enumerating its
 * episodes). One fetch, cached. */
export const seriesSynopsis = async (
  src: RecapSource
): Promise<string | null> => {
  const id = await resolveAnimeId(src.title, src.year);
  if (!id) return null;
  const cached = synopsisCache.get(id);
  if (cached !== undefined) return cached;
  const data = await kitsuFetch<KitsuOne<KitsuAnimeAttrs>>(`/anime/${id}`);
  const at = data?.data?.attributes;
  const syn = (at?.synopsis || at?.description || '').trim();
  const result = syn ? clip(syn, 600) : null;
  synopsisCache.set(id, result);
  return result;
};
