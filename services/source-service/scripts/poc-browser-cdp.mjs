// Free Option-B proof v2: attach to a NORMALLY-launched Edge over CDP. Because Edge is
// started without automation flags, navigator.webdriver is false and Cloudflare sees a
// genuine browser (vanilla Playwright launch gets detected -> stuck on the challenge).
//
// Usage:  node scripts/poc-browser-cdp.mjs "One Piece" 1 sub
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
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
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  return out;
}
const head = (s, n = 400) => (s || '').slice(0, n).replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCDP() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(300);
  }
  throw new Error('CDP endpoint never came up');
}

async function main() {
  const userDataDir = path.join(os.tmpdir(), 'edge-poc-profile');
  const child = spawn(
    EDGE,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' },
  );

  let browser;
  try {
    const ver = await waitForCDP();
    console.log(`[cdp] connected: ${ver['Browser']}`);
    browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    const ctx = browser.contexts()[0] || (await browser.newContext());
    const page = ctx.pages()[0] || (await ctx.newPage());

    const isChallenge = (t) =>
      /just a moment|security verification|checking your browser|verifying you are human|attention required/i.test(t);

    async function gotoText(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try {
        await page.waitForFunction(
          () => {
            const t = (document.body?.innerText || '') + ' ' + document.title;
            const challenge = /just a moment|security verification|checking your browser|verifying you are human/i.test(t);
            const body = (document.body?.innerText || '').trim();
            return !challenge && (body.startsWith('{') || body.startsWith('['));
          },
          { timeout: 45000 },
        );
      } catch {}
      await page.waitForTimeout(600);
      return page.evaluate(() => (document.body ? document.body.innerText : ''));
    }
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

    console.log(`\n=== Browser PoC (CDP) ===  query="${QUERY}" ep=${EPISODE} mode=${MODE}\n`);

    const sVars = {
      search: { allowAdult: false, allowUnknown: false, query: QUERY },
      limit: 40,
      page: 1,
      translationType: MODE,
      countryOrigin: 'ALL',
    };
    const sText = await gotoText(gqlUrl(SEARCH_GQL, sVars));
    console.log(`[search] challenge=${isChallenge(sText)} body: ${head(sText)}`);
    const edges = JSON.parse(sText)?.data?.shows?.edges || [];
    if (!edges.length) {
      console.log('\nRESULT: no results / still blocked. Stopping.');
      return;
    }
    const show = edges[0];
    console.log(`\n  -> ${edges.length} results. Top:`);
    edges.slice(0, 5).forEach((e) =>
      console.log(`     _id=${e._id}  "${e.name}"  sub=${e.availableEpisodes?.sub} dub=${e.availableEpisodes?.dub}`),
    );

    const eVars = { showId: show._id, translationType: MODE, episodeString: String(EPISODE) };
    const eText = await fetchSameOrigin(gqlUrl(EPISODE_GQL, eVars));
    console.log(`\n[episode] body: ${head(eText)}`);
    const sourceUrls = JSON.parse(eText)?.data?.episode?.sourceUrls || [];
    const decoded = sourceUrls.map((s) => ({ name: s.sourceName, type: s.type, path: decodeSourceUrl(s.sourceUrl) }));
    console.log(`\n  -> ${decoded.length} sourceUrls:`);
    decoded.forEach((d) => console.log(`     [${d.name}] -> ${head(d.path, 110)}`));

    const clockable = decoded.filter((d) => d.path && d.path.includes('clock'));
    console.log(`\n[clock] resolving ${clockable.length} clock sources...`);
    const found = [];
    for (const d of clockable) {
      const pathJson = d.path.replace('/clock?', '/clock.json?');
      for (const ch of CLOCK_HOSTS) {
        const txt = await gotoText(ch + pathJson);
        if (txt && txt.includes('link')) {
          console.log(`  [${d.name}] ${ch} OK: ${head(txt, 500)}`);
          try {
            (JSON.parse(txt)?.links || []).forEach((l) =>
              found.push({ src: d.name, link: l.link, res: l.resolutionStr, hls: l.hls }),
            );
          } catch {}
          break;
        } else {
          console.log(`  [${d.name}] ${ch} no-links: ${head(txt, 140)}`);
        }
      }
    }

    console.log(`\n=== RESULT: ${found.length} playable links ===`);
    found.forEach((f) => console.log(`  [${f.src}] ${f.res || ''} ${f.hls ? '(hls)' : ''} ${f.link}`));
  } catch (e) {
    console.log('\nERROR:', e?.message || e);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
    try {
      child.kill();
    } catch {}
  }
}

main();
