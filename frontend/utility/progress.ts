import { createStore } from './externalStore';

// Watch progress + watched-episode tracking, keyed by AniList id, in localStorage
// (`kessoku.progress.v1`). Replaces the legacy flat `Anime{id}`="{ep}-{sec}" keys,
// which are migrated once on first client load. Only the direct HlsPlayer records
// playback; the embed iframe is cross-origin and can't report position.

export interface ProgressEntry {
  ep: number; // last-watched episode
  sec: number; // resume position in that episode (floored seconds)
  dur: number; // that episode's duration in seconds; 0 = unknown
  total: number; // total episodes for the title; 0 = unknown
  watched: number[]; // sorted unique episode numbers marked watched
  updatedAt: number; // ms; drives most-recent-first ordering
}
export type ProgressMap = Record<number, ProgressEntry>;
export interface ContinueItem {
  id: number;
  entry: ProgressEntry;
}

const KEY = 'kessoku.progress.v1';
const SENTINEL = 'kessoku.progress.migrated';

const store = createStore<ProgressMap>(KEY, {});
export const subscribeProgress = store.subscribe;
/** Stable empty snapshot for SSR / getServerSnapshot. */
export const CONTINUE_EMPTY: ContinueItem[] = [];

// ---- one-time migration from the legacy flat `Anime{id}` = "{ep}-{sec}" keys ----
let migrated = false;
function ensureMigrated(): void {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  try {
    if (window.localStorage.getItem(SENTINEL)) return;
    const legacy: ProgressMap = {};
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      const m = k ? /^Anime(\d+)$/.exec(k) : null;
      if (k && m) {
        const [ep, sec] = (window.localStorage.getItem(k) || '')
          .split('-')
          .map((n) => parseInt(n, 10));
        if (!Number.isNaN(ep)) {
          legacy[Number(m[1])] = {
            ep: ep || 1,
            sec: Number.isNaN(sec) ? 0 : sec,
            dur: 0,
            total: 0,
            watched: [],
            updatedAt: Date.now() - Object.keys(legacy).length,
          };
        }
        stale.push(k);
      }
    }
    if (Object.keys(legacy).length) {
      let current: ProgressMap = {};
      try {
        const raw = window.localStorage.getItem(KEY);
        current = raw ? (JSON.parse(raw) as ProgressMap) : {};
      } catch {
        current = {};
      }
      // Existing new-format entries win over migrated legacy ones.
      window.localStorage.setItem(
        KEY,
        JSON.stringify({ ...legacy, ...current })
      );
      store.invalidate();
    }
    window.localStorage.setItem(SENTINEL, '1');
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
if (typeof window !== 'undefined') ensureMigrated();

export function getEntry(id: number): ProgressEntry | undefined {
  ensureMigrated();
  return store.get()[id];
}

export function savePosition(
  id: number,
  p: { ep: number; sec: number; dur: number; total: number }
): void {
  ensureMigrated();
  store.update((prev) => {
    const cur = prev[id];
    return {
      ...prev,
      [id]: {
        ep: p.ep,
        sec: p.sec,
        dur: p.dur || cur?.dur || 0,
        total: p.total || cur?.total || 0,
        watched: cur?.watched ?? [],
        updatedAt: Date.now(),
      },
    };
  });
}

export function markWatched(
  id: number,
  ep: number,
  opts?: { total?: number; dur?: number }
): void {
  ensureMigrated();
  store.update((prev) => {
    const cur = prev[id];
    const watched = Array.from(new Set([...(cur?.watched ?? []), ep])).sort(
      (a, b) => a - b
    );
    return {
      ...prev,
      [id]: {
        ep: cur?.ep ?? ep,
        sec: cur?.sec ?? 0,
        dur: opts?.dur || cur?.dur || 0,
        total: opts?.total || cur?.total || 0,
        watched,
        updatedAt: Date.now(),
      },
    };
  });
}

export function unmarkWatched(id: number, ep: number): void {
  ensureMigrated();
  store.update((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    return {
      ...prev,
      [id]: {
        ...cur,
        watched: cur.watched.filter((e) => e !== ep),
        updatedAt: Date.now(),
      },
    };
  });
}

export function isWatched(id: number, ep: number): boolean {
  ensureMigrated();
  return store.get()[id]?.watched.includes(ep) ?? false;
}

export function removeContinue(id: number): void {
  ensureMigrated();
  store.update((prev) => {
    if (!prev[id]) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

export function getResumeEpisode(id: number): number {
  ensureMigrated();
  return store.get()[id]?.ep || 1;
}

// Memoized against the store's snapshot reference so useSyncExternalStore stays stable.
let lastMap: ProgressMap | undefined;
let lastList: ContinueItem[] = [];
export function listContinue(): ContinueItem[] {
  ensureMigrated();
  const map = store.get();
  if (map === lastMap) return lastList;
  lastMap = map;
  lastList = Object.keys(map)
    .map((id) => ({ id: Number(id), entry: map[Number(id)] }))
    .filter(({ entry }) => {
      const finished = entry.total > 0 && entry.watched.length >= entry.total;
      return !finished && (entry.sec > 5 || entry.watched.length > 0);
    })
    .sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
  return lastList;
}
