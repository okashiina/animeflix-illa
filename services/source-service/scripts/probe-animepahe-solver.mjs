// AnimePahe -> m3u8 via a FlareSolverr SESSION (browser TLS satisfies DDoS-Guard).
// Every request goes through the session; JSON comes back wrapped in <pre>, so we
// extract + HTML-decode it. Then play page -> kwik embed -> unpack packed JS -> m3u8.
//
//   node scripts/probe-animepahe-solver.mjs "One Piece" 1
import process from 'node:process';
import fs from 'node:fs/promises';

const FS = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const BASE = process.env.ANIMEPAHE_BASE || 'https://animepahe.org';
const QUERY = process.argv[2] || 'One Piece';
const EP = parseInt(process.argv[3] || '1', 10);

const post = (b) =>
  fetch(FS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const head = (s, n = 220) => String(s ?? '').slice(0, n).replace(/\s+/g, ' ');
const htmlDecode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function extractJson(html) {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return JSON.parse(htmlDecode(m ? m[1] : html));
}

// Dean Edwards p,a,c,k,e,d unpacker (kwik obfuscation).
function unpack(js) {
  const m = js.match(/\}\s*\(\s*'(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/s);
  if (!m) return null;
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const a = +m[2];
  let c = +m[3];
  const k = m[4].split('|');
  const e = (n) => (n < a ? '' : e(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
  return p;
}

async function sGet(session, url) {
  const r = await post({ cmd: 'request.get', session, url, maxTimeout: 60000 });
  if (r.status !== 'ok') throw new Error(`flaresolverr: ${r.message || r.status}`);
  return r.solution?.response || '';
}

async function main() {
  console.log(`\n=== AnimePahe via FlareSolverr session ===  "${QUERY}" ep=${EP}  base=${BASE}\n`);
  const cs = await post({ cmd: 'sessions.create' });
  const session = cs.session;
  console.log(`session: ${session}`);
  try {
    await sGet(session, BASE + '/'); // warm DDoS-Guard clearance

    const sr = await sGet(session, `${BASE}/api?m=search&q=${encodeURIComponent(QUERY)}`);
    const results = extractJson(sr).data || [];
    console.log(`\n[search] ${results.length} results`);
    results.slice(0, 4).forEach((a) => console.log(`   "${a.title}" (${a.type} ${a.year}) session=${a.session}`));
    if (!results.length) return;
    const anime = results[0];

    // release: page through episode_asc until we find episode EP
    let target = null;
    let page = 1;
    let lastPage = 1;
    do {
      const rr = await sGet(session, `${BASE}/api?m=release&id=${anime.session}&sort=episode_asc&page=${page}`);
      const rj = extractJson(rr);
      lastPage = rj.last_page || 1;
      target = (rj.data || []).find((e) => Number(e.episode) === EP);
      if (page === 1) console.log(`\n[release] last_page=${lastPage}, page1 eps=${(rj.data || []).map((e) => e.episode).slice(0, 8).join(',')}...`);
      page += 1;
    } while (!target && page <= lastPage && page <= 6);
    if (!target) {
      console.log(`\nep ${EP} not found in first pages.`);
      return;
    }
    console.log(`  -> ep ${target.episode} session=${target.session} audio=${target.audio}`);

    const playHtml = await sGet(session, `${BASE}/play/${anime.session}/${target.session}`);
    let buttons = [...playHtml.matchAll(/data-src="(https:\/\/kwik\.[^"]+)"[^>]*?data-audio="([^"]*)"[^>]*?data-resolution="([^"]*)"/g)].map((m) => ({
      url: htmlDecode(m[1]),
      audio: m[2],
      res: m[3],
    }));
    if (!buttons.length)
      buttons = [...playHtml.matchAll(/https:\/\/kwik\.[a-z]+\/[ef]\/[A-Za-z0-9]+/g)].map((m) => ({ url: m[0], audio: '?', res: '?' }));
    console.log(`\n[play] ${buttons.length} kwik links:`);
    buttons.forEach((b) => console.log(`   [${b.res}p ${b.audio}] ${b.url}`));
    if (!buttons.length) {
      console.log(`  play head: ${head(playHtml, 280)}`);
      return;
    }

    const best = buttons.slice().sort((a, b) => (Number(b.res) || 0) - (Number(a.res) || 0))[0];
    // Kwik is referer-locked; FlareSolverr can't set Referer on navigation, so try a
    // direct fetch with the kwik referer (its WAF 1020 is usually referer-gated).
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let kwikHtml = '';
    for (const ref of ['https://kwik.cx/', `${BASE}/`]) {
      const kr = await fetch(best.url, { headers: { 'User-Agent': UA, Referer: ref } });
      kwikHtml = await kr.text();
      console.log(`[kwik] ref=${ref} status=${kr.status} len=${kwikHtml.length} ${/just a moment|cloudflare|access denied|1020/i.test(kwikHtml) ? '(CF/WAF blocked)' : ''}`);
      if (kr.status === 200 && /eval\(function\(p,a,c,k,e,d\)/.test(kwikHtml)) break;
    }
    await fs.writeFile('scripts/kwik-dump.html', kwikHtml).catch(() => {});
    const blocks = kwikHtml.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\s*,\s*\d+\s*,\s*\{\}\)\)/g) || [];
    console.log(`  saved kwik HTML; packer blocks=${blocks.length}`);
    let m3u8 = null;
    let allUnpacked = '';
    for (const blk of blocks) {
      const u = unpack(blk);
      if (!u) continue;
      allUnpacked += `\n\n===== block (${u.length} chars) =====\n${u}`;
      const hit = (u.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
      if (hit) m3u8 = hit;
    }
    await fs.writeFile('scripts/kwik-unpacked.txt', allUnpacked || '(none)').catch(() => {});
    if (!m3u8) {
      const i = allUnpacked.indexOf('m3u8');
      const rawI = kwikHtml.indexOf('m3u8');
      console.log(`[kwik] m3u8 in-unpacked idx=${i}, in-raw idx=${rawI}, unpackedTotal=${allUnpacked.length}`);
      if (i >= 0) console.log('  unpacked ctx:', allUnpacked.slice(Math.max(0, i - 200), i + 120));
      if (rawI >= 0) console.log('  raw ctx:', kwikHtml.slice(Math.max(0, rawI - 200), rawI + 120));
      console.log('  urls in unpacked:', [...allUnpacked.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]).slice(0, 12));
    }

    console.log(`\n=== RESULT (${best.res}p ${best.audio}) ===`);
    console.log(m3u8 ? `m3u8: ${m3u8}` : 'no m3u8 extracted');
  } finally {
    await post({ cmd: 'sessions.destroy', session });
    console.log('\n(session destroyed)');
  }
}

main().catch((e) => console.log('\nERROR:', e?.message || e));
