import { LRUCache } from 'lru-cache';
import { config } from '../config.js';
import type { WatchParams } from '../types.js';
import * as subdl from './subdl.js';
import * as jimaku from './jimaku.js';
import { translateVtt } from './translate.js';

// External subtitle tracks (Phase 3):
//   • Indonesian (auto) — the Japanese (Jimaku) track machine-translated to id.
//     Inherits Jimaku's perfect timing, so it fixes the drift subdl can't.
//   • Indonesian — subdl's human translation (nicer text, Crunchyroll-timed → may drift).
//   • Japanese — Jimaku, AniList-native, perfectly timed.
//   • English — subdl.
// The resolver returns track metadata; the actual VTT is fetched + converted (and,
// for mt-*, translated) on demand by /subs, so /watch stays fast and each track
// is cached independently.

export type SubtitleSource = 'subdl' | 'jimaku' | 'mt-id';

export interface SubtitleTrack {
  source: SubtitleSource;
  lang: string;
  label: string;
  ref: string; // upstream download URL (resolved + converted lazily by /subs)
}

const trackCache = new LRUCache<string, SubtitleTrack[]>({
  max: 1000,
  ttl: config.subtitleTtlMs,
});
const vttCache = new LRUCache<string, string>({
  max: 300,
  ttl: config.subtitleTtlMs,
});

export async function resolveSubtitleTracks(
  params: WatchParams
): Promise<SubtitleTrack[]> {
  const key = `${params.anilistId}:${params.episode}`;
  const cached = trackCache.get(key);
  if (cached) return cached;

  const [indo, en, ja] = await Promise.all([
    subdl.findIndo(params.titles, params.episode).catch(() => []),
    subdl.findEnglish(params.titles, params.episode).catch(() => []),
    jimaku.findJapanese(params.anilistId, params.episode).catch(() => []),
  ]);

  const tracks: SubtitleTrack[] = [];

  // Indonesian (auto) first so it's the default id pick — it shares the Japanese
  // track's perfect timing, where subdl's human file drifts vs the AnimePahe cut.
  for (const t of ja) {
    tracks.push({
      source: 'mt-id',
      lang: 'id',
      label: 'Indonesian (auto)',
      ref: t.url, // the Jimaku file; /subs fetches then translates ja → id
    });
  }
  for (const t of indo) {
    tracks.push({ source: 'subdl', lang: t.lang, label: t.label, ref: t.url });
  }
  for (const t of ja) {
    tracks.push({ source: 'jimaku', lang: t.lang, label: t.label, ref: t.url });
  }
  for (const t of en) {
    tracks.push({ source: 'subdl', lang: t.lang, label: t.label, ref: t.url });
  }

  trackCache.set(key, tracks);
  return tracks;
}

// SSRF guard: /subs will fetch whatever `ref` we hand it, so only ever allow the
// hosts our own resolvers produce.
const ALLOWED = ['subdl.com', 'jimaku.cc'];
function hostAllowed(host: string): boolean {
  return ALLOWED.some((a) => host === a || host.endsWith(`.${a}`));
}

/** Fetch + convert one track's upstream file to WebVTT (cached by ref). */
export async function fetchSubtitleVtt(
  source: string,
  ref: string
): Promise<string | null> {
  let host: string;
  try {
    host = new URL(ref).hostname;
  } catch {
    return null;
  }
  if (!hostAllowed(host)) return null;

  // Key by source too: mt-id and jimaku share the same Jimaku `ref` but produce
  // different VTT (translated vs original), so a ref-only key would collide.
  const cacheKey = `${source}|${ref}`;
  const cached = vttCache.get(cacheKey);
  if (cached) return cached;

  let vtt: string | null;
  if (source === 'mt-id') {
    const jp = await jimaku.fetchVtt(ref);
    vtt = jp ? await translateVtt(jp, 'ja', 'id') : null;
  } else if (source === 'jimaku') {
    vtt = await jimaku.fetchVtt(ref);
  } else {
    vtt = await subdl.fetchVtt(ref);
  }
  if (vtt) vttCache.set(cacheKey, vtt);
  return vtt;
}
