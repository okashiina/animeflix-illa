// research-filler-demo.mjs — live verification of the filler/canon classifier.
//
// Duplicates the logic of packages/api/src/filler.ts (a .mjs script can't import
// the TS module directly) and runs getFillerEpisodes against well-known titles,
// printing per-kind counts + the first filler episode numbers so we can eyeball
// that the famous filler arcs show up.
//
//   node scripts/research-filler-demo.mjs
//   node scripts/research-filler-demo.mjs "Bleach" "Hunter x Hunter" "Attack on Titan"
//
// Source: animefillerlist.com — each show page has a <table class="EpisodeList">
// whose rows carry one of: manga_canon | filler | mixed_canon/filler | anime_canon.

import process from 'node:process';

const SITE = 'https://www.animefillerlist.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 12000;

const KIND_BY_CLASS = {
  manga_canon: 'canon',
  filler: 'filler',
  'mixed_canon/filler': 'mixed',
  anime_canon: 'anime-canon',
};

const episodesCache = new Map();
const slugCache = new Map();
const pageHtmlCache = new Map();
let showIndex = null;
let showIndexPromise = null;

const normalize = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const slugify = (title) => normalize(title).replace(/ /g, '-');

function candidateSlugs(title) {
  const out = [];
  const push = (s) => {
    if (s && out.indexOf(s) === -1) out.push(s);
  };
  push(slugify(title));
  push(slugify(title.replace(/\s*\(\d{4}\)\s*/g, ' ').trim()));
  push(slugify(title.replace(/\([^)]*\)/g, ' ').trim()));
  push(slugify(title.split(':')[0].trim()));
  return out;
}

function buildAliases(title) {
  const aliases = new Set();
  const add = (s) => {
    const n = normalize(s);
    if (n) aliases.add(n);
  };
  add(title);
  add(title.replace(/\([^)]*\)/g, ' '));
  const parenRe = /\(([^)]*)\)/g;
  let m;
  while ((m = parenRe.exec(title)) !== null) add(m[1]);
  const colon = title.split(':');
  if (colon.length > 1) {
    add(colon[0]);
    add(colon.slice(1).join(' '));
  }
  return aliases;
}

async function fetchText(url) {
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

async function getShowIndex() {
  if (showIndex) return showIndex;
  if (showIndexPromise) return showIndexPromise;
  showIndexPromise = (async () => {
    const html = await fetchText(`${SITE}/shows`);
    if (!html) {
      showIndexPromise = null;
      return null;
    }
    const entries = [];
    const linkRe = /href="\/shows\/([a-z0-9-]+)">([^<]+)<\/a>/gi;
    let m;
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

async function resolveSlug(title) {
  const key = normalize(title);
  if (!key) return null;
  if (slugCache.has(key)) return slugCache.get(key) ?? null;

  for (const slug of candidateSlugs(title)) {
    const html = await fetchText(`${SITE}/shows/${slug}`);
    if (html && html.indexOf('class="EpisodeList"') !== -1) {
      slugCache.set(key, slug);
      pageHtmlCache.set(slug, html);
      return slug;
    }
  }

  const index = await getShowIndex();
  if (index) {
    const qSlug = key.replace(/ /g, '-');
    const hit =
      index.find((e) => e.slug === qSlug) ||
      index.find((e) => e.aliases.has(key));
    if (hit) {
      slugCache.set(key, hit.slug);
      return hit.slug;
    }
  }

  slugCache.set(key, null);
  return null;
}

function parseEpisodeTable(html) {
  const result = new Map();
  const start = html.indexOf('class="EpisodeList"');
  if (start === -1) return result;
  const end = html.indexOf('</table>', start);
  const table = end === -1 ? html.slice(start) : html.slice(start, end);
  const rowRe =
    /<tr class="([a-z_/]+)[^"]*"[^>]*>\s*<td class="Number">(\d+)<\/td>/gi;
  let m;
  while ((m = rowRe.exec(table)) !== null) {
    const kind = KIND_BY_CLASS[m[1]];
    if (!kind) continue;
    const num = parseInt(m[2], 10);
    if (!Number.isNaN(num)) result.set(num, kind);
  }
  return result;
}

async function getFillerEpisodes(title) {
  try {
    if (!title || !title.trim()) return new Map();
    const slug = await resolveSlug(title);
    if (!slug) return new Map();
    const cached = episodesCache.get(slug);
    if (cached) return cached;
    let html = pageHtmlCache.get(slug) ?? null;
    if (!html) html = await fetchText(`${SITE}/shows/${slug}`);
    if (!html) return new Map();
    const episodes = parseEpisodeTable(html);
    episodesCache.set(slug, episodes);
    pageHtmlCache.delete(slug);
    return episodes;
  } catch {
    return new Map();
  }
}

// ---- demo runner ----

function summarize(title, map) {
  console.log(`\n=== ${title} ===`);
  if (map.size === 0) {
    console.log('  (no data — show not found or scrape failed)');
    return;
  }
  const counts = { canon: 0, filler: 0, mixed: 0, 'anime-canon': 0 };
  for (const kind of map.values()) counts[kind] = (counts[kind] || 0) + 1;
  const total = map.size;
  const nums = [...map.keys()].sort((a, b) => a - b);
  const filler = nums.filter((n) => map.get(n) === 'filler');

  console.log(`  total episodes : ${total}  (range ${nums[0]}-${nums[nums.length - 1]})`);
  console.log(`  Manga Canon    : ${counts.canon}`);
  console.log(`  Filler         : ${counts.filler}`);
  console.log(`  Mixed          : ${counts.mixed}`);
  console.log(`  Anime Canon    : ${counts['anime-canon']}`);
  console.log(`  first 15 filler: ${filler.slice(0, 15).join(', ')}`);
}

async function main() {
  const titles =
    process.argv.length > 2 ? process.argv.slice(2) : ['Naruto', 'One Piece'];
  console.log('animefillerlist.com — canon/filler classifier live probe');
  console.log('titles:', titles.join(' | '));

  for (const title of titles) {
    const map = await getFillerEpisodes(title);
    summarize(title, map);
  }

  // Edge case: a title whose site slug differs from the naive slug (resolved
  // via the /shows index), and a guaranteed not-found (must be an empty Map).
  const aot = await getFillerEpisodes('Attack on Titan');
  summarize('Attack on Titan (index-resolved slug)', aot);

  const missing = await getFillerEpisodes('Totally Fake Show 9000 Zzz');
  console.log(
    `\n[graceful-failure check] "Totally Fake Show 9000 Zzz" -> Map size ${missing.size} (expected 0)`
  );
}

main().catch((e) => console.log('\nFATAL (should never happen):', e?.message || e));
