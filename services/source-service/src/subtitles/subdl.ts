import { config } from '../config.js';
import { toVtt } from './vtt.js';
import { unzip } from './unzip.js';

// subdl.com — the best API-accessible Indonesian source (often Crunchyroll-sourced
// per-episode). Keyed by IMDb/TMDB or title text-search; we use title search since
// we don't carry IMDb ids. See docs/SUBTITLE-SOURCING-RESEARCH.md.

const API = 'https://api.subdl.com/api/v1/subtitles';
const DL = 'https://dl.subdl.com';

interface SubdlSub {
  language?: string;
  name?: string;
  season?: number;
  episode?: number;
  url?: string; // e.g. "/subtitle/3543428-8465515.zip"
}

export interface SubtitleRef {
  lang: string;
  label: string;
  url: string; // absolute download URL (a zip)
}

/**
 * Find an Indonesian track for one episode. Tries each candidate title until one
 * returns ID subtitles. NOTE: query `languages=ID` alone — a combined ID,EN lets
 * English fill the 30-row page and hide the Indonesian rows.
 */
export async function findIndo(
  titles: string[],
  episode: number
): Promise<SubtitleRef[]> {
  if (!config.subdlApiKey) return [];

  for (const title of titles) {
    if (!title) continue;
    const params = new URLSearchParams({
      film_name: title,
      languages: 'ID',
      subs_per_page: '30',
      api_key: config.subdlApiKey,
    });

    let subs: SubdlSub[];
    try {
      const res = await fetch(`${API}?${params}`, {
        headers: { 'User-Agent': config.userAgent },
      });
      const body = (await res.json()) as { subtitles?: SubdlSub[] };
      subs = (body.subtitles || []).filter(
        (s) => String(s.language).toUpperCase() === 'ID' && s.url
      );
    } catch {
      continue;
    }
    if (!subs.length) continue;

    // Prefer an exact episode match (lowest season wins for multi-cour rips),
    // else a whole-season/movie file with no episode number.
    const exact = subs
      .filter((s) => Number(s.episode) === episode)
      .sort((a, b) => (a.season ?? 99) - (b.season ?? 99));
    const pick = exact[0] || subs.find((s) => !s.episode);
    if (!pick?.url) continue;

    const url = pick.url.startsWith('http') ? pick.url : `${DL}${pick.url}`;
    return [{ lang: 'id', label: 'Indonesian', url }];
  }

  return [];
}

/** Download a subdl zip, pick the subtitle file, and convert it to WebVTT. */
export async function fetchVtt(url: string): Promise<string | null> {
  let buf: Buffer;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }

  // subdl always serves a zip; fall back to treating the body as raw text.
  try {
    const files = unzip(buf);
    const names = Object.keys(files);
    const name =
      names.find((n) => /\.(ass|ssa|srt|vtt)$/i.test(n)) || names[0];
    if (!name) return null;
    return toVtt(files[name].toString('utf8'), name);
  } catch {
    return toVtt(buf.toString('utf8'), url);
  }
}
