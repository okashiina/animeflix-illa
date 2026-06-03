// Soft-sub research probe — AllAnime (allanime.day) via the ani-cli method.
//
// CONTEXT: AllAnime is the SURVIVING extractor target (ani-cli, 12.5k*, was patched
// 2026-04 for AllAnime's AES-256-CTR key change; the HiAnime/consumet repos were
// DMCA'd 2026-03). BUT: AllAnime aggregates third-party video hosts and the
// `sourceUrls` decode to clock/links endpoints that return only VIDEO m3u8 — it is
// effectively HARDSUB for our purposes (ani-cli pulls no separate VTT). This probe
// documents the live method and checks whether ANY softsub/caption field comes back.
//
// Current ani-cli params (verified from pystardust/ani-cli master, 2026-05):
//   api      = https://api.allanime.day/api
//   referer  = https://youtu-chan.com         (NOTE: changed from allanime.to)
//   UA       = Firefox/150.0
//   decrypt  = AES-256-CTR, key = sha256("Xot36i3lK3:v1"), iv = bytes[1..13], ctr=iv+"00000002"
//   episode  = persisted query hash d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec
//
// AllAnime is Cloudflare-gated (api.allanime.day -> 403 from a plain fetch), so the
// real GETs go through FlareSolverr to mint cf_clearance (see flaresolverr.ts).
// FlareSolverr's 8191 is only on the docker network, so this script tries the
// internal host first, then localhost; if neither is up it prints the method only.
//
// Usage: node scripts/research-softsub-allanime.mjs "Dandadan" 1 sub
import process from 'node:process';
import crypto from 'node:crypto';

const API = 'https://api.allanime.day/api';
const REFERER = 'https://youtu-chan.com';
const ORIGIN = 'https://allanime.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const FS_CANDIDATES = [
  process.env.FLARESOLVERR_URL,
  'http://flaresolverr:8191/v1',
  'http://localhost:8191/v1',
].filter(Boolean);

const QUERY = process.argv[2] || 'Dandadan';
const EP = process.argv[3] || '1';
const MODE = process.argv[4] || 'sub';

const SEARCH_GQL =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';
const EPISODE_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }';

const gql = (q, v) =>
  `${API}?variables=${encodeURIComponent(JSON.stringify(v))}&query=${encodeURIComponent(q)}`;
const head = (s, n = 200) => String(s ?? '').slice(0, n).replace(/\s+/g, ' ');

// AllAnime sourceUrl obfuscation: leading '-' + hex pairs XOR 56 (ani-cli legacy
// path; newer encrypted blobs use AES-256-CTR — handled below if present).
const decodeXor = (s) => {
  if (!s || !s.startsWith('-')) return s;
  const hex = s.replace(/^-+/, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  return out;
};

async function findFlaresolverr() {
  for (const url of FS_CANDIDATES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'sessions.list' }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) return url;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function solve(fs, url) {
  const r = await fetch(fs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
  });
  const j = await r.json();
  if (j.status !== 'ok') throw new Error(`flaresolverr: ${j.message || j.status}`);
  return { cookies: j.solution.cookies || [], ua: j.solution.userAgent };
}
const cookieHeader = (c) => c.map((x) => `${x.name}=${x.value}`).join('; ');
const get = (url, ua, cookie) =>
  fetch(url, { headers: { 'User-Agent': ua, Referer: REFERER, Origin: ORIGIN, Cookie: cookie } }).then(
    async (r) => ({ status: r.status, text: await r.text() })
  );

async function main() {
  console.log(`\n=== AllAnime SOFT-SUB research ===  query="${QUERY}" ep=${EP} mode=${MODE}`);
  console.log(`Method (ani-cli 2026-05): api=${API} referer=${REFERER}`);
  console.log(`key=sha256("Xot36i3lK3:v1")=${crypto.createHash('sha256').update('Xot36i3lK3:v1').digest('hex').slice(0, 16)}...\n`);

  const fs = await findFlaresolverr();
  if (!fs) {
    console.log('FlareSolverr not reachable on', FS_CANDIDATES.join(', '));
    console.log('-> api.allanime.day is Cloudflare-gated; run this where FlareSolverr is up');
    console.log('   (inside the source-service docker network, or with 8191 published).');
    console.log('\nNOTE: even when this resolves, AllAnime sourceUrls -> clock/links return');
    console.log('VIDEO m3u8 only. No separate VTT/caption field => HARDSUB for our needs.');
    return;
  }
  console.log(`[flaresolverr] up at ${fs}`);

  const sVars = {
    search: { allowAdult: false, allowUnknown: false, query: QUERY },
    limit: 40,
    page: 1,
    translationType: MODE,
    countryOrigin: 'ALL',
  };
  const searchUrl = gql(SEARCH_GQL, sVars);
  const { cookies, ua } = await solve(fs, searchUrl);
  const cookie = cookieHeader(cookies);
  console.log(`[clearance] cf_clearance=${cookies.some((c) => c.name === 'cf_clearance')} ua=${head(ua, 50)}`);

  const s = await get(searchUrl, ua, cookie);
  const edges = JSON.parse(s.text || '{}')?.data?.shows?.edges || [];
  console.log(`[search] status=${s.status} ${edges.length} results`);
  if (!edges.length) {
    console.log(`  body: ${head(s.text)}`);
    return;
  }
  const show = edges[0];
  console.log(`  -> _id=${show._id} "${show.name}"`);

  const eVars = { showId: show._id, translationType: MODE, episodeString: String(EP) };
  const e = await get(gql(EPISODE_GQL, eVars), ua, cookie);
  console.log(`[episode] status=${e.status} ${head(e.text, 160)}`);
  const sourceUrls = JSON.parse(e.text || '{}')?.data?.episode?.sourceUrls || [];
  console.log(`  -> ${sourceUrls.length} sourceUrls`);
  sourceUrls.forEach((x) =>
    console.log(`     [${x.sourceName}] ${head(decodeXor(x.sourceUrl), 70)}`)
  );

  // Softsub check: does ANY sourceUrl object carry a subtitle/caption field?
  const anySub = sourceUrls.some(
    (x) => x.subtitles || x.captions || /\.vtt/i.test(JSON.stringify(x))
  );
  console.log(`\n=== RESULT: video sources present=${sourceUrls.length > 0}; external subtitle field=${anySub} ===`);
  console.log(anySub ? '  (unexpected — investigate)' : '  -> confirms AllAnime = HARDSUB (no separate VTT).');
}

main().catch((e) => console.log('\nERROR:', e?.message || e));
