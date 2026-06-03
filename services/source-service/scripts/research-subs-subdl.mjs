// Research probe: subdl.com — general subtitle site with a documented REST API
// and a real Indonesian catalogue (it is an Indonesia-friendly community site).
//
// API: GET https://api.subdl.com/api/v1/subtitles
//   required: api_key  (free, from https://subdl.com/panel/api after sign-up)
//   lookup:   film_name=... OR sd_id / imdb_id / tmdb_id
//   tv:       type=tv & season_number & episode_number
//   langs:    languages=ID,EN  (Indonesian IS a supported code)
//   packing:  subs_per_page (<=30), unpack=1 to list per-episode files
// Output: JSON { status, results[], subtitles[] }; each subtitle.url is a ZIP of
// .srt files under https://dl.subdl.com/subtitle/...
//
// The id-mapping pain: subdl keys on IMDb/TMDB (movie/series level), NOT AniList
// and NOT AniDB. Anime seasons map one-to-many onto a single IMDb series id, so
// episode addressing relies on season_number/episode_number that rarely line up
// with AniList's per-cour split. Title search (film_name) is the pragmatic path.
//
// Run:
//   SUBDL_KEY=xxxx node scripts/research-subs-subdl.mjs
//   node scripts/research-subs-subdl.mjs        (no key -> shows the 401/error)

const KEY = process.env.SUBDL_KEY || '';
const FILM = process.env.FILM || 'Frieren';
const LANGS = process.env.LANGS || 'ID,EN';

(async () => {
  console.log(`# subdl probe — film="${FILM}" languages=${LANGS}`);
  console.log(`# key present: ${KEY ? 'yes' : 'NO'}\n`);

  const params = new URLSearchParams({
    film_name: FILM,
    languages: LANGS,
    subs_per_page: '30',
  });
  if (KEY) params.set('api_key', KEY);
  const url = `https://api.subdl.com/api/v1/subtitles?${params}`;
  console.log(`GET ${KEY ? url.replace(KEY, 'KEY') : url}`);

  let r;
  let text;
  try {
    r = await fetch(url, { headers: { 'User-Agent': 'kessoku-research/1.0' } });
    text = await r.text();
  } catch (e) {
    console.log('  fetch failed:', e.message);
    return;
  }
  console.log(`  -> ${r.status}`);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.log(
      '  non-json (subdl returns a 422 validation error when api_key is missing):',
      text.slice(0, 200)
    );
    console.log(
      '\n  NEEDS A KEY: api_key is mandatory. Free key at https://subdl.com/panel/api'
    );
    return;
  }

  if (!KEY || body.status === false || r.status === 401 || r.status === 422) {
    console.log('  ', JSON.stringify(body).slice(0, 200));
    console.log(
      '\n  NEEDS A KEY: subdl requires api_key on every request. Free key at'
    );
    console.log('  https://subdl.com/panel/api');
    console.log(
      '\n  WITH A KEY this would print, per subtitle: { language, release_name, url(zip),'
    );
    console.log(
      '  season, episode } — and we would count how many came back with language="indonesian".'
    );
    return;
  }

  const subs = body.subtitles || [];
  console.log(`  results: ${(body.results || []).length}, subtitles: ${subs.length}`);
  const byLang = {};
  for (const s of subs) byLang[s.language] = (byLang[s.language] || 0) + 1;
  console.log('  language histogram:', byLang);
  const indo = subs.filter((s) => /indones/i.test(s.language || ''));
  console.log(`  Indonesian subtitle files: ${indo.length}`);
  for (const s of indo.slice(0, 8)) {
    console.log(`   - [${s.language}] ${s.release_name} -> ${s.url}`);
  }
})().catch((e) => console.error('FATAL', e));
