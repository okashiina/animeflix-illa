// Research probe: OpenSubtitles.com REST API.
//
// API: https://api.opensubtitles.com/api/v1
//   auth:    Api-Key header (free, from https://www.opensubtitles.com/en/consumers
//            after registering an account + an API consumer) — MANDATORY on every
//            call. Without it the service returns 403 "You cannot consume this
//            service" (verified by this probe).
//   search:  GET /subtitles?query=...&languages=id&season_number=&episode_number=
//            or &imdb_id= / &tmdb_id= / &parent_imdb_id= for episodes.
//   download:POST /download with file_id -> a temporary link to the .srt.
//
// The mapping pain (the real blocker for anime):
//   * OpenSubtitles keys on IMDb / TMDB ids, which are SERIES-level for anime.
//     AniList splits a show into per-cour entries with their own ids and per-cour
//     episode numbering; IMDb lumps them into one series with absolute or
//     TVDB-style season/episode numbering. So AniList(id,ep) -> IMDb(series,
//     season,ep) is a lossy, error-prone mapping.
//   * To even attempt it you must first map AniList -> IMDb/TMDB (e.g. via
//     github.com/Fribb/anime-lists which carries imdb_id/themoviedb_id columns,
//     or arm.haglund.dev), then guess the season/episode offset. Frequent misses.
//
// Limits: free tier = ~5 downloads/day anonymous, ~20/day with a free account;
// VIP tiers raise it. Search itself is rate-limited per key.
//
// Run:
//   OS_KEY=xxxx node scripts/research-subs-opensubtitles.mjs
//   node scripts/research-subs-opensubtitles.mjs     (no key -> shows the 403)

const KEY = process.env.OS_KEY || '';
const QUERY = process.env.QUERY || 'Frieren';
const LANG = process.env.LANG || 'id';

const headers = {
  'User-Agent': 'kessoku-sub-research v1.0',
  Accept: 'application/json',
};
if (KEY) headers['Api-Key'] = KEY;

(async () => {
  console.log(`# OpenSubtitles probe — query="${QUERY}" languages=${LANG}`);
  console.log(`# key present: ${KEY ? 'yes' : 'NO (expect 403)'}\n`);

  const url = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(
    QUERY
  )}&languages=${LANG}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const text = await r.text();
  console.log(`  -> ${r.status}`);

  if (r.status === 403 || r.status === 401) {
    console.log('  ', text.slice(0, 160));
    console.log(
      '\n  AUTH WALL: Api-Key header is mandatory. Register a (free) API consumer at'
    );
    console.log('  https://www.opensubtitles.com/en/consumers to get a key.');
    console.log(
      '\n  WITH A KEY this would report total_count and a per-language breakdown for'
    );
    console.log(
      '  the query, so we could measure how many Indonesian anime-episode subs exist'
    );
    console.log('  (expected: sparse for anime, decent for live-action movies).');
    return;
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.log('  non-json:', text.slice(0, 200));
    return;
  }
  const data = body.data || [];
  console.log(`  total_count=${body.total_count} returned=${data.length}`);
  const langs = {};
  let anime = 0;
  for (const d of data) {
    const a = d.attributes || {};
    langs[a.language] = (langs[a.language] || 0) + 1;
    const fc = a.feature_details || {};
    if (/anime/i.test(JSON.stringify(fc))) anime += 1;
    void anime;
  }
  console.log('  language histogram (this page):', langs);
  for (const d of data.slice(0, 8)) {
    const a = d.attributes || {};
    console.log(
      `   - [${a.language}] ${a.release} (feature: ${a.feature_details?.title})`
    );
  }
})().catch((e) => console.error('FATAL', e));
