import { config } from '../config.js';
import { toVtt } from './vtt.js';
import type { SubtitleRef } from './subdl.js';

// Jimaku.cc — AniList-native Japanese subtitle repository (the cleanest mapping
// of any source: our primary id is a first-class lookup key). Files are .srt/.ass.

const API = 'https://jimaku.cc/api';

interface JimakuEntry {
  id: number;
  name?: string;
  english_name?: string;
}
interface JimakuFile {
  name: string;
  url: string;
}

/** Best-effort episode number out of a subtitle filename. */
function fileEpisode(name: string): number | null {
  const patterns = [
    /[Ss]\d{1,2}[Ee](\d{1,3})/, // S01E17
    /\b-\s*(\d{1,3})(?:v\d)?\s*[([]/, // " - 17 (1080p)"
    /\bE[Pp]?\s*(\d{1,3})\b/, // EP17 / E17
    /\[(\d{1,3})\]/, // [17]
  ];
  for (const re of patterns) {
    const m = re.exec(name);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export async function findJapanese(
  anilistId: number,
  episode: number
): Promise<SubtitleRef[]> {
  if (!config.jimakuApiKey || !anilistId) return [];
  const headers = { Authorization: config.jimakuApiKey };

  let entry: JimakuEntry | undefined;
  try {
    const res = await fetch(
      `${API}/entries/search?anilist_id=${anilistId}`,
      { headers }
    );
    const body = (await res.json()) as JimakuEntry[];
    entry = Array.isArray(body) ? body[0] : undefined;
  } catch {
    return [];
  }
  if (!entry?.id) return [];

  let files: JimakuFile[];
  try {
    const res = await fetch(`${API}/entries/${entry.id}/files`, { headers });
    files = (await res.json()) as JimakuFile[];
  } catch {
    return [];
  }
  if (!Array.isArray(files) || files.length === 0) return [];

  // Prefer a file whose name carries this episode number; else, if the entry has
  // a single file (e.g. a movie), use it.
  const match =
    files.find((f) => fileEpisode(f.name) === episode) ||
    (files.length === 1 ? files[0] : undefined);
  if (!match?.url) return [];

  return [{ lang: 'ja', label: 'Japanese', url: match.url }];
}

export async function fetchVtt(url: string): Promise<string | null> {
  let text: string;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }
  return toVtt(text, url);
}
