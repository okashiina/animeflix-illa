import { LRUCache } from 'lru-cache';
import { config } from '../config.js';
import type { WatchParams } from '../types.js';
import * as subdl from './subdl.js';
import * as jimaku from './jimaku.js';

// External subtitle tracks (Phase 3): Indonesian via subdl, Japanese via Jimaku.
// English comes free from soft-sub video providers, so it isn't sourced here.
// The resolver returns track metadata; the actual VTT is fetched + converted
// on demand by /subs (keeps /watch fast and lets the browser cache per track).

export type SubtitleSource = 'subdl' | 'jimaku';

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

  const [indo, ja] = await Promise.all([
    subdl.findIndo(params.titles, params.episode).catch(() => []),
    jimaku.findJapanese(params.anilistId, params.episode).catch(() => []),
  ]);

  const tracks: SubtitleTrack[] = [
    ...indo.map((t) => ({
      source: 'subdl' as const,
      lang: t.lang,
      label: t.label,
      ref: t.url,
    })),
    ...ja.map((t) => ({
      source: 'jimaku' as const,
      lang: t.lang,
      label: t.label,
      ref: t.url,
    })),
  ];

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

  const cached = vttCache.get(ref);
  if (cached) return cached;

  const vtt =
    source === 'jimaku' ? await jimaku.fetchVtt(ref) : await subdl.fetchVtt(ref);
  if (vtt) vttCache.set(ref, vtt);
  return vtt;
}
