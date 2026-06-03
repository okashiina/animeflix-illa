/**
 * filler.ts — classify anime episodes as canon vs filler.
 *
 * Source of truth: animefillerlist.com. Each show lives at
 *   https://www.animefillerlist.com/shows/<slug>
 * and ships a `<table class="EpisodeList">` whose every `<tr>` carries one of
 * four type classes plus a `<td class="Number">` cell, e.g.
 *   <tr class="manga_canon odd" id="eps-1"><td class="Number">1</td>...
 *   <tr class="filler even" id="eps-26"><td class="Number">26</td>...
 *   <tr class="mixed_canon/filler odd" ...>      (note the literal slash)
 *   <tr class="anime_canon even" ...>
 *
 * This module resolves a title to its show slug (direct slug guesses first, then
 * the site's /shows index as a fallback), scrapes that table, and returns a
 * Map<episodeNumber, FillerKind>. It NEVER throws: on any failure (not found,
 * network, parse) it returns an empty Map so a calling page never breaks.
 *
 * No new dependencies: plain `fetch` (Node 18+) + regex parsing, in-memory cache.
 */

export type FillerKind = 'canon' | 'filler' | 'mixed' | 'anime-canon';

const SITE = 'https://www.animefillerlist.com';

// Browser-like UA — the site serves plain HTML to this, no challenge.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 12000;

// The data is static-ish (a show's filler list rarely changes), so cache hard.
// Cache key = resolved slug; a successful empty parse is still cached to avoid
// re-hammering. `null` resolution (title not found) is cached per-title too.
const episodesCache = new Map<string, Map<number, FillerKind>>();
const slugCache = new Map<string, string | null>();

// The /shows index (title -> slug for every show) — fetched at most once, then
// reused for every fallback resolution.
let showIndex: ShowIndexEntry[] | null = null;
let showIndexPromise: Promise<ShowIndexEntry[] | null> | null = null;

// Short-lived cache of a resolved show page's HTML so resolveSlug + parse don't
// double-fetch the same URL. Keyed by slug.
const pageHtmlCache = new Map<string, string>();

interface ShowIndexEntry {
  slug: string;
  title: string;
  aliases: Set<string>;
}

/** Map an animefillerlist row class to our public FillerKind. */
const KIND_BY_CLASS: Record<string, FillerKind> = {
  manga_canon: 'canon',
  filler: 'filler',
  'mixed_canon/filler': 'mixed',
  anime_canon: 'anime-canon',
};

/** Normalize a title for comparison: lowercase, strip accents/punctuation. */
function normalize(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining marks
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalized title -> a hyphenated slug guess. */
function slugify(title: string): string {
  return normalize(title).replace(/ /g, '-');
}

/**
 * Ordered list of slug candidates to try directly before hitting the index.
 * Handles the common shapes: raw, "(2011)" year tags, "(Shingeki...)" parens,
 * and "Title: Subtitle".
 */
function candidateSlugs(title: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && out.indexOf(s) === -1) out.push(s);
  };

  push(slugify(title));

  const noYear = title.replace(/\s*\(\d{4}\)\s*/g, ' ').trim();
  push(slugify(noYear));

  const noParen = title.replace(/\([^)]*\)/g, ' ').trim();
  push(slugify(noParen));

  const beforeColon = title.split(':')[0].trim();
  push(slugify(beforeColon));

  return out;
}

/** Build the set of normalized aliases an index entry should match on. */
function buildAliases(title: string): Set<string> {
  const aliases = new Set<string>();
  const add = (s: string) => {
    const n = normalize(s);
    if (n) aliases.add(n);
  };

  add(title);
  add(title.replace(/\([^)]*\)/g, ' ')); // base, parens stripped
  // each parenthetical, e.g. "(Shingeki no Kyojin)" -> "shingeki no kyojin"
  const parenRe = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = parenRe.exec(title)) !== null) add(m[1]);
  // colon-split halves: "Demon Slayer: Kimetsu no Yaiba"
  const colon = title.split(':');
  if (colon.length > 1) {
    add(colon[0]);
    add(colon.slice(1).join(' '));
  }

  return aliases;
}

/** fetch with a browser UA and a hard timeout. Returns null on any failure. */
async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Lazily fetch + parse the /shows index (every show's title + slug). */
async function getShowIndex(): Promise<ShowIndexEntry[] | null> {
  if (showIndex) return showIndex;
  if (showIndexPromise) return showIndexPromise;

  showIndexPromise = (async () => {
    const html = await fetchText(`${SITE}/shows`);
    if (!html) {
      // Don't poison the cache permanently — allow a later retry.
      showIndexPromise = null;
      return null;
    }

    const entries: ShowIndexEntry[] = [];
    const linkRe = /href="\/shows\/([a-z0-9-]+)">([^<]+)<\/a>/gi;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = linkRe.exec(html)) !== null) {
      const slug = m[1];
      const title = m[2].trim();
      entries.push({ slug, title, aliases: buildAliases(title) });
    }

    showIndex = entries;
    return entries;
  })();

  return showIndexPromise;
}

/**
 * Resolve a title to a show slug.
 *   1. Try candidate slugs directly (one HEAD-ish GET each) — fast, covers most.
 *   2. Fall back to the /shows index, matching by exact slug or exact alias.
 * Returns null when nothing matches. Cached per normalized title.
 */
async function resolveSlug(title: string): Promise<string | null> {
  const key = normalize(title);
  if (!key) return null;
  if (slugCache.has(key)) return slugCache.get(key) ?? null;

  // 1. Direct slug guesses. The sequential await is intentional: candidates are
  //    tried in priority order and the first hit wins, so firing them in
  //    parallel would needlessly hammer the site when guess #1 usually matches.
  /* eslint-disable no-await-in-loop, no-restricted-syntax */
  for (const slug of candidateSlugs(title)) {
    const html = await fetchText(`${SITE}/shows/${slug}`);
    if (html && html.indexOf('class="EpisodeList"') !== -1) {
      slugCache.set(key, slug);
      // Stash the page so getFillerEpisodes can reuse it without re-fetching.
      pageHtmlCache.set(slug, html);
      return slug;
    }
  }
  /* eslint-enable no-await-in-loop, no-restricted-syntax */

  // 2. Index fallback — exact matches only (loose substring matching produced
  //    false positives like "One Piece" -> "one-pace", so we avoid it).
  const index = await getShowIndex();
  if (index) {
    const nq = key;
    const qSlug = nq.replace(/ /g, '-');
    const hit =
      index.find((e) => e.slug === qSlug) ||
      index.find((e) => e.aliases.has(nq));
    if (hit) {
      slugCache.set(key, hit.slug);
      return hit.slug;
    }
  }

  slugCache.set(key, null);
  return null;
}

/** Parse the EpisodeList table out of a show page's HTML. */
function parseEpisodeTable(html: string): Map<number, FillerKind> {
  const result = new Map<number, FillerKind>();

  const start = html.indexOf('class="EpisodeList"');
  if (start === -1) return result;
  const end = html.indexOf('</table>', start);
  const table = end === -1 ? html.slice(start) : html.slice(start, end);

  // Each row: <tr class="<type>[ odd|even]" id="eps-N"> ... <td class="Number">N</td>
  // The class may contain a slash ("mixed_canon/filler"), so allow it in the group.
  const rowRe =
    /<tr class="([a-z_/]+)[^"]*"[^>]*>\s*<td class="Number">(\d+)<\/td>/gi;
  let m: RegExpExecArray | null;
  /* eslint-disable no-cond-assign, no-continue */
  while ((m = rowRe.exec(table)) !== null) {
    const kind = KIND_BY_CLASS[m[1]];
    if (!kind) continue;
    const num = parseInt(m[2], 10);
    if (!Number.isNaN(num)) result.set(num, kind);
  }
  /* eslint-enable no-cond-assign, no-continue */

  return result;
}

/**
 * Resolve a show by title and return a map of episode number -> FillerKind.
 *
 * Never throws: on a missing show, network error, or parse failure it returns
 * an empty Map, so a calling page (e.g. getServerSideProps) can always render.
 *
 * @example
 *   const filler = await getFillerEpisodes('Naruto');
 *   filler.get(26); // 'filler'
 *   filler.get(1);  // 'canon'
 */
export async function getFillerEpisodes(
  title: string
): Promise<Map<number, FillerKind>> {
  try {
    if (!title || !title.trim()) return new Map();

    const slug = await resolveSlug(title);
    if (!slug) return new Map();

    const cached = episodesCache.get(slug);
    if (cached) return cached;

    let html = pageHtmlCache.get(slug) ?? null;
    if (!html) {
      html = await fetchText(`${SITE}/shows/${slug}`);
    }
    if (!html) return new Map();

    const episodes = parseEpisodeTable(html);
    episodesCache.set(slug, episodes);
    pageHtmlCache.delete(slug); // free the raw HTML; keep only the parsed map
    return episodes;
  } catch {
    // Absolute backstop — the caller's page must never break.
    return new Map();
  }
}
