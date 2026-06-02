// Free Option-B proof: drive the user's REAL Edge (headed) to pass Cloudflare and
// resolve AllAnime end-to-end (search -> episode -> decode sourceUrls -> clock -> m3u8/mp4).
// No 150MB browser download — uses installed Edge via playwright-core.
//
// Usage:  node scripts/poc-browser.mjs "One Piece" 1 sub
import { chromium } from 'playwright-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const QUERY = process.argv[2] || 'Dandadan';
const EPISODE = process.argv[3] || '1';
const MODE = process.argv[4] || 'sub';

const API = 'https://api.allanime.day/api';
const CLOCK_HOSTS = ['https://allanime.day', 'https://api.allanime.day'];

const SEARCH_GQL =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';
const EPISODE_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }';

const gqlUrl = (q, v) =>
  `${API}?variables=${encodeURIComponent(JSON.stringify(v))}&query=${encodeURIComponent(q)}`;

function decodeSourceUrl(s) {
  if (!s || !s.startsWith('-')) return s;
  const hex = s.replace(/^-+/, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  }
  return out;
}
const head = (s, n = 400) => (s || '').slice(0, n).replace(/\s+/g, ' ');

async function main() {
  const browser = await chromium.launch({ headless: false, executablePath: EDGE });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  // Navigate to a URL and return the page's text after clearing any CF interstitial.
  async function gotoText(url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForFunction(
        () => !/just a moment|checking your browser|attention required/i.test(document.title),
        { timeout: 30000 },
      );
    } catch {
      /* fall through; we'll read whatever is there */
    }
    // small settle for the challenge redirect to land on the JSON body
    await page.waitForTimeout(800);
    return page.evaluate(() => (document.body ? document.body.innerText : ''));
  }
  // Once a host's cf_clearance cookie exists in the context, same-origin fetch works.
  async function fetchSameOrigin(url) {
    return page.evaluate(async (u) => {
      try {
        const r = await fetch(u, { headers: { Referer: 'https://allanime.to/' } });
        return await r.text();
      } catch (e) {
        return 'FETCH_ERR:' + (e?.message || e);
      }
    }, url);
  }

  try {
    console.log(`\n=== Browser PoC ===  query="${QUERY}" ep=${EPISODE} mode=${MODE}\n`);

    // STEP 1 — search (this navigation solves Cloudflare for api.allanime.day)
    const sVars = {
      search: { allowAdult: false, allowUnknown: false, query: QUERY },
      limit: 40,
      page: 1,
      translationType: MODE,
      countryOrigin: 'ALL',
    };
    const sText = await gotoText(gqlUrl(SEARCH_GQL, sVars));
    console.log(`[search] body: ${head(sText)}`);
    const edges = JSON.parse(sText)?.data?.shows?.edges || [];
    if (!edges.length) {
      console.log('\nRESULT: no search results (or still blocked). Stopping.');
      return;
    }
    const show = edges[0];
    console.log(`\n  -> ${edges.length} results. Using top:`);
    edges.slice(0, 5).forEach((e) =>
      console.log(`     _id=${e._id}  "${e.name}"  sub=${e.availableEpisodes?.sub} dub=${e.availableEpisodes?.dub}`),
    );

    // STEP 2 — episode sourceUrls (same origin, cf_clearance now present -> fetch works)
    const eVars = { showId: show._id, translationType: MODE, episodeString: String(EPISODE) };
    const eText = await fetchSameOrigin(gqlUrl(EPISODE_GQL, eVars));
    console.log(`\n[episode] body: ${head(eText)}`);
    const sourceUrls = JSON.parse(eText)?.data?.episode?.sourceUrls || [];
    const decoded = sourceUrls.map((s) => ({
      name: s.sourceName,
      type: s.type,
      path: decodeSourceUrl(s.sourceUrl),
    }));
    console.log(`\n  -> ${decoded.length} sourceUrls:`);
    decoded.forEach((d) => console.log(`     [${d.name}] -> ${head(d.path, 110)}`));

    // STEP 3 — resolve clock endpoints into real media links
    const clockable = decoded.filter((d) => d.path && d.path.includes('clock'));
    console.log(`\n[clock] resolving ${clockable.length} clock sources...`);
    const found = [];
    for (const d of clockable) {
      const pathJson = d.path.replace('/clock?', '/clock.json?');
      for (const ch of CLOCK_HOSTS) {
        const url = ch.includes('api.allanime') ? ch + pathJson : ch + pathJson;
        // navigate (solves CF for that host) then read
        const txt = await gotoText(url);
        if (txt && txt.includes('link')) {
          console.log(`  [${d.name}] ${ch} OK: ${head(txt, 500)}`);
          try {
            const links = JSON.parse(txt)?.links || [];
            links.forEach((l) => found.push({ src: d.name, link: l.link, res: l.resolutionStr, hls: l.hls }));
          } catch {}
          break;
        } else {
          console.log(`  [${d.name}] ${ch} no-links: ${head(txt, 160)}`);
        }
      }
    }

    console.log(`\n=== RESULT: ${found.length} playable links ===`);
    found.forEach((f) => console.log(`  [${f.src}] ${f.res || ''} ${f.hls ? '(hls)' : ''} ${f.link}`));
  } catch (e) {
    console.log('\nERROR:', e?.message || e);
  } finally {
    await browser.close();
  }
}

main();
