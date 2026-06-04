import type { Provider, WatchParams, ResolveResult, Source } from '../types.js';
import { createSession, destroySession, sessionGet } from '../flaresolverr.js';

// AnimePahe provider. Pipeline (proven in scripts/probe-animepahe-solver.mjs):
//   FlareSolverr session (DDoS-Guard) -> /api search -> /api release (episode)
//   -> /play HTML (kwik embed buttons) -> fetch kwik with Referer -> unpack packed
//   JS -> m3u8 (referer-locked to kwik, so we pass Referer for the HLS proxy).

const BASE = process.env.ANIMEPAHE_BASE || 'https://animepahe.org';
const KWIK_REFERER = 'https://kwik.cx/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const htmlDecode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// AnimePahe JSON comes back wrapped in <pre> (Chrome JSON viewer) + HTML-escaped.
function extractJson<T = unknown>(html: string): T | null {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  try {
    return JSON.parse(htmlDecode(m ? m[1] : html)) as T;
  } catch {
    return null;
  }
}

// Dean Edwards p,a,c,k,e,d unpacker (kwik obfuscation).
function unpack(js: string): string | null {
  const m = js.match(/\}\s*\(\s*'(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/s);
  if (!m) return null;
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const a = Number(m[2]);
  let c = Number(m[3]);
  const k = m[4].split('|');
  const e = (n: number): string =>
    (n < a ? '' : e(Math.floor(n / a))) +
    ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
  return p;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface PaheSearchItem {
  title: string;
  type: string;
  episodes: number;
  year: number;
  session: string;
}
interface PaheReleaseItem {
  episode: number;
  session: string;
  audio: string;
}
interface PaheRelease {
  per_page: number;
  last_page: number;
  data: PaheReleaseItem[];
}

function pickAnime(results: PaheSearchItem[], titles: string[]): PaheSearchItem {
  const wanted = titles.map(norm);
  const exact = results.find((r) => wanted.includes(norm(r.title)));
  if (exact) return exact;
  const tv = results.find((r) => r.type === 'TV');
  return tv || results[0];
}

async function findEpisode(
  session: string,
  animeSession: string,
  ep: number
): Promise<PaheReleaseItem | null> {
  const pageUrl = (p: number): string =>
    `${BASE}/api?m=release&id=${animeSession}&sort=episode_asc&page=${p}`;
  const getPage = async (p: number): Promise<PaheRelease | null> =>
    extractJson<PaheRelease>((await sessionGet(session, pageUrl(p))).response);

  const first = await getPage(1);
  if (!first) return null;
  const hit1 = first.data.find((e) => Number(e.episode) === ep);
  if (hit1) return hit1;

  const perPage = first.per_page || first.data.length || 30;
  const lastPage = first.last_page || 1;
  // Estimate the page holding episode `ep`, then probe it and its neighbours.
  const est = Math.min(lastPage, Math.max(1, Math.ceil(ep / perPage)));
  for (const p of [est, est - 1, est + 1]) {
    if (p < 2 || p > lastPage) continue;
    const page = await getPage(p);
    const hit = page?.data.find((e) => Number(e.episode) === ep);
    if (hit) return hit;
  }
  return null;
}

interface KwikButton {
  url: string;
  res: string;
  audio: string;
}
function extractKwik(playHtml: string): KwikButton[] {
  const out: KwikButton[] = [];
  for (const m of playHtml.matchAll(/<button[^>]*\bdata-src="(https:\/\/kwik\.[^"]+)"[^>]*>/g)) {
    const tag = m[0];
    out.push({
      url: htmlDecode(m[1]),
      audio: (tag.match(/data-audio="([^"]*)"/) || [])[1] || '?',
      res: (tag.match(/data-resolution="([^"]*)"/) || [])[1] || '?',
    });
  }
  if (!out.length) {
    for (const m of playHtml.matchAll(/https:\/\/kwik\.[a-z]+\/[ef]\/[A-Za-z0-9]+/g))
      out.push({ url: m[0], res: '?', audio: '?' });
  }
  return out;
}

// kwik embed -> m3u8. Plain fetch (FlareSolverr can't set Referer; kwik's WAF is
// referer-gated). Two packer blocks; the stream URL is in one of them.
async function kwikToM3u8(kwikUrl: string): Promise<string | null> {
  const res = await fetch(kwikUrl, { headers: { 'User-Agent': UA, Referer: KWIK_REFERER } });
  if (!res.ok) return null;
  const html = await res.text();
  const blocks =
    html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\s*,\s*\d+\s*,\s*\{\}\)\)/g) || [];
  for (const blk of blocks) {
    const un = unpack(blk);
    const hit = un && (un.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
    if (hit) return hit;
  }
  return (html.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0] || null;
}

export const animepahe: Provider = {
  id: 'animepahe',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    const query = params.titles.find(Boolean);
    if (!query) return null;

    const session = await createSession();
    try {
      await sessionGet(session, `${BASE}/`); // warm DDoS-Guard clearance

      const sr = await sessionGet(session, `${BASE}/api?m=search&q=${encodeURIComponent(query)}`);
      const results = extractJson<{ data: PaheSearchItem[] }>(sr.response)?.data || [];
      if (!results.length) return null;

      const anime = pickAnime(results, params.titles);
      const target = await findEpisode(session, anime.session, params.episode);
      if (!target) return null;

      const playHtml = (
        await sessionGet(session, `${BASE}/play/${anime.session}/${target.session}`)
      ).response;
      const kwik = extractKwik(playHtml);
      if (!kwik.length) return null;

      // AnimePahe audio: jpn = subbed (hard-subbed), eng = dubbed. The
      // data-audio attribute is reliable here, so for a dub request we require a
      // real `eng` track. If there is none, return no source and let the resolver
      // fail over to a dub-capable provider (AllAnime) — never silently serve the
      // jpn (sub) track when dub was asked for.
      const wantDub = params.category === 'dub';
      const engTracks = kwik.filter((k) => k.audio === 'eng');
      const unknownTracks = kwik.filter((k) => k.audio === '?');

      if (wantDub && !engTracks.length) return null;

      const jpnTracks = kwik.filter((k) => k.audio === 'jpn');
      const pool = wantDub
        ? engTracks.concat(unknownTracks)
        : (jpnTracks.length ? jpnTracks.concat(unknownTracks) : kwik);
      const ordered = pool.sort(
        (a, b) => (Number(b.res) || 0) - (Number(a.res) || 0)
      );

      const sources: Source[] = [];
      const seen = new Set<string>();
      for (const k of ordered) {
        const m3u8 = await kwikToM3u8(k.url);
        if (m3u8 && !seen.has(m3u8)) {
          seen.add(m3u8);
          sources.push({
            url: m3u8,
            quality: k.res && k.res !== '?' ? `${k.res}p` : 'auto',
            isM3U8: true,
            headers: { Referer: KWIK_REFERER },
          });
        }
      }
      if (!sources.length) return null;

      return { provider: 'animepahe', sources, subtitles: [], headers: { Referer: KWIK_REFERER } };
    } finally {
      await destroySession(session);
    }
  },
};
