// Live PoC probe for AllAnime — run from a residential IP (your laptop) to find out:
//   1. does the GraphQL API respond at all (or 403/Cloudflare)?
//   2. can we search -> show id -> episode sourceUrls?
//   3. can we decode sourceUrls and fetch the "clock" endpoint -> real m3u8/mp4?
// If all of this works WITHOUT FlareSolverr, a cheap 1GB VPS (or your own PC) is enough.
//
// Usage:  node scripts/probe-allanime.mjs "One Piece" 1 sub
import process from 'node:process';

const QUERY = process.argv[2] || 'One Piece';
const EPISODE = process.argv[3] || '1';
const MODE = process.argv[4] || 'sub'; // sub | dub

// Endpoints/headers per the ani-cli / consumet method. We test a few host variants
// because AllAnime rotates domains; the probe tells us which is live right now.
const API_HOSTS = ['https://api.allanime.day/api', 'https://api.allanime.to/api'];
const CLOCK_HOSTS = ['https://allanime.day', 'https://api.allanime.day'];
const REFERER = 'https://allanime.to/';
const ORIGIN = 'https://allanime.to';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SEARCH_GQL =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';

const EPISODE_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }';

const headers = { 'User-Agent': UA, Referer: REFERER, Origin: ORIGIN };

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function gqlUrl(apiHost, query, variables) {
  return `${apiHost}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
}

// AllAnime obfuscates sourceUrl: strip leading dashes, then XOR each byte with 56.
function decodeSourceUrl(s) {
  if (!s || !s.startsWith('-')) return s;
  const hex = s.replace(/^-+/, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  }
  return out;
}

function head(s, n = 300) {
  return (s || '').slice(0, n).replace(/\s+/g, ' ');
}

async function main() {
  console.log(`\n=== AllAnime probe ===  query="${QUERY}" ep=${EPISODE} mode=${MODE}\n`);

  // STEP 1 — search (also tells us if the API host is alive / behind Cloudflare)
  let apiHost = null;
  let show = null;
  for (const h of API_HOSTS) {
    const vars = {
      search: { allowAdult: false, allowUnknown: false, query: QUERY },
      limit: 40,
      page: 1,
      translationType: MODE,
      countryOrigin: 'ALL',
    };
    const r = await get(gqlUrl(h, SEARCH_GQL, vars));
    console.log(`[search] ${h}\n  status=${r.status} ok=${r.ok}\n  body: ${head(r.text)}`);
    if (!r.ok) continue;
    try {
      const edges = JSON.parse(r.text)?.data?.shows?.edges || [];
      if (edges.length) {
        apiHost = h;
        show = edges[0];
        console.log(`\n  -> ${edges.length} results. Top matches:`);
        edges.slice(0, 5).forEach((e) =>
          console.log(
            `     _id=${e._id}  "${e.name}"  sub=${e.availableEpisodes?.sub} dub=${e.availableEpisodes?.dub}`,
          ),
        );
        break;
      }
    } catch (e) {
      console.log(`  parse error: ${e.message}`);
    }
  }
  if (!show) {
    console.log('\nRESULT: search failed on all API hosts. (Cloudflare/403 => need FlareSolverr.)');
    return;
  }

  // STEP 2 — episode sourceUrls
  console.log(`\n[episode] showId=${show._id} ep=${EPISODE}`);
  const epVars = { showId: show._id, translationType: MODE, episodeString: String(EPISODE) };
  const er = await get(gqlUrl(apiHost, EPISODE_GQL, epVars));
  console.log(`  status=${er.status} ok=${er.ok}\n  body: ${head(er.text)}`);
  if (!er.ok) {
    console.log('\nRESULT: search worked but episode query failed.');
    return;
  }
  let sourceUrls = [];
  try {
    sourceUrls = JSON.parse(er.text)?.data?.episode?.sourceUrls || [];
  } catch (e) {
    console.log(`  parse error: ${e.message}`);
  }
  console.log(`\n  -> ${sourceUrls.length} sourceUrls:`);
  const decoded = sourceUrls.map((s) => ({
    name: s.sourceName,
    type: s.type,
    priority: s.priority,
    raw: s.sourceUrl,
    path: decodeSourceUrl(s.sourceUrl),
  }));
  decoded.forEach((d) => console.log(`     [${d.name}] type=${d.type} -> ${head(d.path, 120)}`));

  // STEP 3 — resolve "clock" endpoints into real video links
  const clockable = decoded.filter((d) => d.path && d.path.includes('clock'));
  console.log(`\n[clock] ${clockable.length} clock-style sources to resolve`);
  for (const d of clockable) {
    const pathJson = d.path.replace('/clock?', '/clock.json?');
    for (const ch of CLOCK_HOSTS) {
      const url = ch + pathJson;
      const r = await get(url);
      console.log(`  [${d.name}] ${ch}\n    status=${r.status} body: ${head(r.text, 400)}`);
      if (r.ok && r.text.includes('link')) break;
    }
  }
  console.log('\n=== done ===\n');
}

main();
