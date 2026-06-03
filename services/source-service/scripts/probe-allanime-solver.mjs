// AllAnime resolve THROUGH FlareSolverr (the Cloudflare solver). Strategy: use
// FlareSolverr only to mint a cf_clearance cookie + matching User-Agent for the
// CF-gated host, then make the actual GraphQL GETs ourselves with plain fetch +
// those cookie/UA (FlareSolverr's Chrome renders JSON as a viewer, so we do NOT
// parse its response body — we reuse its cookies, which are IP+UA bound and valid
// because FlareSolverr runs on this same machine).
//
// Run AFTER Docker + FlareSolverr are up:
//   docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
//   node scripts/probe-allanime-solver.mjs "Dandadan" 1 sub
import process from 'node:process';

const FS = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const API = 'https://api.allanime.day/api';
const CLOCK_HOST = 'https://allanime.day';
const REFERER = 'https://allanime.to/';

const QUERY = process.argv[2] || 'Dandadan';
const EPISODE = process.argv[3] || '1';
const MODE = process.argv[4] || 'sub';

const SEARCH_GQL =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';
const EPISODE_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }';

const gql = (q, v) =>
  `${API}?variables=${encodeURIComponent(JSON.stringify(v))}&query=${encodeURIComponent(q)}`;

const decode = (s) => {
  if (!s || !s.startsWith('-')) return s;
  const hex = s.replace(/^-+/, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  return out;
};
const head = (s, n = 200) => String(s ?? '').slice(0, n).replace(/\s+/g, ' ');

async function solve(url) {
  const res = await fetch(FS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
  });
  const j = await res.json();
  if (j.status !== 'ok') throw new Error(`flaresolverr: ${j.message || j.status}`);
  return { cookies: j.solution.cookies || [], ua: j.solution.userAgent };
}
const cookieHeader = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join('; ');

async function get(url, ua, cookie) {
  const res = await fetch(url, {
    headers: { 'User-Agent': ua, Referer: REFERER, Origin: 'https://allanime.to', Cookie: cookie },
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  console.log(`\n=== AllAnime via FlareSolverr ===  query="${QUERY}" ep=${EPISODE} mode=${MODE}`);
  console.log(`FlareSolverr: ${FS}\n`);

  // 1) Mint cf_clearance + UA for api.allanime.day by solving the search URL once.
  const sVars = {
    search: { allowAdult: false, allowUnknown: false, query: QUERY },
    limit: 40,
    page: 1,
    translationType: MODE,
    countryOrigin: 'ALL',
  };
  const searchUrl = gql(SEARCH_GQL, sVars);
  console.log('[solve] minting cf_clearance for api.allanime.day ...');
  const { cookies, ua } = await solve(searchUrl);
  const cookie = cookieHeader(cookies);
  console.log(`  got ${cookies.length} cookies (cf_clearance=${cookies.some((c) => c.name === 'cf_clearance')}), ua=${head(ua, 60)}`);

  // 2) Now fetch the API directly with the minted cookie/UA.
  const s = await get(searchUrl, ua, cookie);
  console.log(`\n[search] status=${s.status} body: ${head(s.text)}`);
  const edges = JSON.parse(s.text)?.data?.shows?.edges || [];
  if (!edges.length) {
    console.log('\nRESULT: no results (or still blocked).');
    return;
  }
  const show = edges[0];
  console.log(`  -> ${edges.length} results. Using _id=${show._id} "${show.name}"`);

  // DIAGNOSTIC: ani-cli's show-detail query (different resolver) to confirm data + ep list.
  const SHOW_GQL =
    'query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail } }';
  const sd = await get(gql(SHOW_GQL, { showId: show._id }), ua, cookie);
  console.log(`\n[show-detail] status=${sd.status} body: ${head(sd.text, 260)}`);

  const eVars = { showId: show._id, translationType: MODE, episodeString: String(EPISODE) };
  const e = await get(gql(EPISODE_GQL, eVars), ua, cookie);
  console.log(`\n[episode] status=${e.status} body: ${head(e.text)}`);
  const sourceUrls = JSON.parse(e.text)?.data?.episode?.sourceUrls || [];
  const decoded = sourceUrls.map((x) => ({ name: x.sourceName, path: decode(x.sourceUrl) }));
  console.log(`  -> ${decoded.length} sourceUrls:`);
  decoded.forEach((d) => console.log(`     [${d.name}] ${head(d.path, 90)}`));

  // 3) Resolve clock endpoints (may need clearance for allanime.day too).
  let clockCookie = cookie;
  let clockUa = ua;
  const found = [];
  for (const d of decoded.filter((x) => x.path && x.path.includes('clock'))) {
    const pathJson = d.path.replace('/clock?', '/clock.json?');
    let r = await get(CLOCK_HOST + pathJson, clockUa, clockCookie);
    if (r.status === 403) {
      console.log('  [clock] 403 — minting clearance for allanime.day ...');
      const sol = await solve(CLOCK_HOST + pathJson);
      clockCookie = cookieHeader(sol.cookies);
      clockUa = sol.ua;
      r = await get(CLOCK_HOST + pathJson, clockUa, clockCookie);
    }
    if (r.text && r.text.includes('link')) {
      try {
        (JSON.parse(r.text)?.links || []).forEach((l) => found.push({ src: d.name, link: l.link, res: l.resolutionStr, hls: l.hls }));
      } catch {}
      console.log(`  [${d.name}] OK: ${head(r.text, 300)}`);
    } else {
      console.log(`  [${d.name}] status=${r.status} ${head(r.text, 120)}`);
    }
  }

  console.log(`\n=== RESULT: ${found.length} playable links ===`);
  found.forEach((f) => console.log(`  [${f.src}] ${f.res || ''} ${f.hls ? '(hls)' : ''} ${f.link}`));
}

main().catch((e) => console.log('\nERROR:', e?.message || e));
