// Soft-sub research probe — HiAnime / Zoro via the `aniwatch` npm scraper.
//
// PURPOSE: HiAnime is the canonical SOFT-SUB source. Unlike AnimePahe (hardsub),
// HiAnime serves raw video + SEPARATE WebVTT subtitle tracks (multi-language).
// The `aniwatch` lib (already a dependency, v2.27.9) returns them as
// `getEpisodeSources(...).subtitles[]` = [{ url, lang }] — VTT URLs we can hand
// straight to our HlsPlayer `subtitles` prop ({ url, lang, label? }).
//
// This script does TWO things and is honest about which layer fails:
//   (A) RAW REACHABILITY: hit the HiAnime origin hosts directly with a real UA
//       so we can tell apart  DNS-block / TCP-reset / Cloudflare-403 / OK.
//       (proves the "ISP-blocked from this residential laptop" claim or refutes it)
//   (B) FULL EXTRACTOR: run the aniwatch pipeline search -> episodes -> sources
//       and print whether subtitles[] (VTT) come back, and in which languages.
//
// Usage: node scripts/research-softsub-hianime.mjs "Frieren" 1 sub
//   env ANIWATCH_DOMAIN=hianime.to  to point the lib at the alternate host.
import process from 'node:process';
import dns from 'node:dns/promises';
import { HiAnime } from 'aniwatch';

const QUERY = process.argv[2] || 'Frieren';
const EP = parseInt(process.argv[3] || '1', 10);
const CATEGORY = process.argv[4] || 'sub';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const head = (s, n = 110) => String(s ?? '').slice(0, n).replace(/\s+/g, ' ');

// Hosts aniwatch / the HiAnime ecosystem use. We probe each so VPS-vs-laptop is clear.
const HOSTS = [
  process.env.ANIWATCH_DOMAIN || 'aniwatchtv.to',
  'hianime.to',
  'hianimez.to',
  'megacloud.blog', // the source CDN that actually serves the m3u8 + VTT
];

async function probeHost(host) {
  const url = `https://${host}/`;
  // DNS first — a block at the resolver looks different from a TCP/TLS reset.
  let ip = '(dns-fail)';
  try {
    ip = (await dns.lookup(host)).address;
  } catch (e) {
    return { host, ip, layer: 'DNS', detail: e.code || e.message };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'manual',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = await res.text().catch(() => '');
    const cf = /just a moment|cf-chl|challenge-platform|cloudflare/i.test(body);
    return {
      host,
      ip,
      layer: 'HTTP',
      status: res.status,
      server: res.headers.get('server') || '?',
      cfChallenge: cf,
      detail: head(body.replace(/<[^>]+>/g, ' '), 80),
    };
  } catch (e) {
    clearTimeout(t);
    return { host, ip, layer: 'CONNECT', detail: `${e.cause?.code || e.name}: ${e.message}` };
  }
}

async function main() {
  console.log(`\n=== HiAnime SOFT-SUB research ===  query="${QUERY}" ep=${EP} cat=${CATEGORY}`);
  console.log(`aniwatch host: ${process.env.ANIWATCH_DOMAIN || 'aniwatchtv.to (default)'}\n`);

  console.log('--- (A) raw host reachability (UA-spoofed plain fetch) ---');
  for (const h of HOSTS) {
    const r = await probeHost(h);
    if (r.layer === 'DNS') console.log(`  ${h.padEnd(18)} DNS-BLOCK (${r.detail})`);
    else if (r.layer === 'CONNECT')
      console.log(`  ${h.padEnd(18)} ip=${r.ip}  CONNECT-FAIL: ${r.detail}`);
    else
      console.log(
        `  ${h.padEnd(18)} ip=${r.ip}  HTTP ${r.status}  server=${r.server}` +
          `${r.cfChallenge ? '  [CLOUDFLARE CHALLENGE]' : ''}`
      );
  }

  console.log('\n--- (B) full aniwatch extractor pipeline ---');
  const hianime = new HiAnime.Scraper();
  try {
    const search = await hianime.search(QUERY);
    const animes = search?.animes || [];
    console.log(`  [search] ${animes.length} results`);
    if (!animes.length) {
      console.log('  RESULT: extractor reached the site but got 0 results (parse drift or block).');
      return;
    }
    const anime = animes[0];
    console.log(`  [using] ${anime.id}  "${anime.name}"`);

    const epData = await hianime.getEpisodes(anime.id);
    const episodes = epData?.episodes || [];
    const target = episodes.find((e) => e.number === EP) || episodes[EP - 1] || episodes[0];
    console.log(`  [episodes] total=${episodes.length}  -> episodeId=${target?.episodeId}`);
    if (!target) return;

    const sources = await hianime.getEpisodeSources(target.episodeId, 'hd-1', CATEGORY);
    console.log(`  [sources] ${sources?.sources?.length || 0} video source(s):`);
    (sources?.sources || []).forEach((s) => console.log(`     ${s.type || s.isM3U8 ? 'm3u8' : ''} ${head(s.url, 90)}`));

    // THE KEY OUTPUT: external subtitle tracks (VTT). v2.27.9 -> sources.subtitles[]
    const subs = sources?.subtitles || sources?.tracks || [];
    const vtt = subs.filter((s) => /\.vtt(\?|$)/i.test(s.url || '') || s.lang);
    console.log(`  [subtitles] ${subs.length} external track(s)  (VTT-looking: ${vtt.length}):`);
    subs.forEach((s) => console.log(`     lang=${s.lang || s.label || '?'}  ${head(s.url, 95)}`));
    console.log(`  [intro] ${JSON.stringify(sources?.intro)}  [headers] ${JSON.stringify(sources?.headers)}`);

    const ok = sources?.sources?.length && subs.length;
    console.log(
      `\n  === RESULT: ${ok ? 'SOFT-SUB SUCCESS — m3u8 + external VTT tracks' : sources?.sources?.length ? 'video but NO external subs' : 'NO SOURCES'} ===`
    );
  } catch (e) {
    console.log('  EXTRACTOR ERROR:', head(e?.message || e, 200));
    if (/403|cloudflare|just a moment/i.test(String(e)))
      console.log('  -> Cloudflare/anti-bot. Needs FlareSolverr or a clean (VPS) IP.');
    else if (/fetchError|ENOTFOUND|ECONNRESET|ETIMEDOUT|something went wrong/i.test(String(e)))
      console.log('  -> network layer failed (DNS/TCP) — consistent with an ISP/geo block from this IP.');
  }
}

main();
