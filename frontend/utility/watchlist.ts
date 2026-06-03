import { createStore } from './externalStore';
import { getEntry } from './progress';

// "My List" watchlist, keyed by AniList id, in localStorage (`kessoku.watchlist.v1`).
// Anonymous/local-only (no auth) — the precursor to AniList OAuth sync.

export interface WatchlistItem {
  id: number;
  addedAt: number;
}
export type LibStatus = 'toWatch' | 'watching' | 'completed';

const KEY = 'kessoku.watchlist.v1';
const store = createStore<WatchlistItem[]>(KEY, []);
export const subscribeWatchlist = store.subscribe;
/** Stable empty snapshot for SSR / getServerSnapshot. */
export const WATCHLIST_EMPTY: number[] = [];

// Memoized id list (most-recent-first) against the store reference for hook stability.
let lastArr: WatchlistItem[] | undefined;
let lastIds: number[] = [];
export function listWatchlistIds(): number[] {
  const arr = store.get();
  if (arr === lastArr) return lastIds;
  lastArr = arr;
  lastIds = [...arr].sort((a, b) => b.addedAt - a.addedAt).map((i) => i.id);
  return lastIds;
}

export function inWatchlist(id: number): boolean {
  return store.get().some((i) => i.id === id);
}

export function addToWatchlist(id: number): void {
  store.update((prev) =>
    prev.some((i) => i.id === id)
      ? prev
      : [...prev, { id, addedAt: Date.now() }]
  );
}

export function removeFromWatchlist(id: number): void {
  store.update((prev) => prev.filter((i) => i.id !== id));
}

/** Toggle membership; returns the NEW membership state. */
export function toggleWatchlist(id: number): boolean {
  const has = inWatchlist(id);
  if (has) removeFromWatchlist(id);
  else addToWatchlist(id);
  return !has;
}

/** Library status derived from watch progress (for the /watchlist filter tabs). */
export function deriveStatus(id: number): LibStatus {
  const e = getEntry(id);
  if (!e) return 'toWatch';
  if (
    e.total > 0 &&
    (e.watched.length >= e.total || e.watched.includes(e.total))
  ) {
    return 'completed';
  }
  if (e.watched.length > 0 || e.sec > 5) return 'watching';
  return 'toWatch';
}
