import { createStore } from './externalStore';
import { getEntry } from './progress';
import { addToWatchlist, inWatchlist } from './watchlist';

// Explicit per-title list status (`kessoku.liststatus.v1`). When set it is
// authoritative; otherwise the status is derived from watch progress. Maps 1:1
// onto AniList's MediaListStatus so it syncs straight up. Membership in the
// watchlist + this status together mirror an AniList list entry.

export type AniStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'DROPPED'
  | 'REPEATING';

type StatusMap = Record<number, AniStatus>;
const KEY = 'kessoku.liststatus.v1';
const store = createStore<StatusMap>(KEY, {});
export const subscribeStatus = store.subscribe;

/** The whole explicit-status map (for AniList sync diffing). Read-only. */
export const getStatusMap = (): Readonly<StatusMap> => store.get();

// Order shown in the picker. REPEATING is omitted from the UI but still
// respected if AniList sends it on a pull.
export const STATUS_OPTIONS: { value: AniStatus; label: string }[] = [
  { value: 'CURRENT', label: 'Watching' },
  { value: 'PLANNING', label: 'Plan to Watch' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAUSED', label: 'On Hold' },
  { value: 'DROPPED', label: 'Dropped' },
];

export const statusLabel = (s: AniStatus): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ??
  (s === 'REPEATING' ? 'Rewatching' : s);

export const getExplicitStatus = (id: number): AniStatus | undefined =>
  store.get()[id];

export const setExplicitStatus = (id: number, status: AniStatus): void => {
  addToWatchlist(id); // a status implies the title is on the list
  store.update((prev) =>
    prev[id] === status ? prev : { ...prev, [id]: status }
  );
};

export const clearExplicitStatus = (id: number): void => {
  store.update((prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
};

/**
 * Effective status: the explicit override, else derived from progress /
 * membership. `null` means the title isn't on the list at all. Returns a
 * primitive so it's a stable `useSyncExternalStore` snapshot.
 */
export const effectiveStatus = (id: number): AniStatus | null => {
  const explicit = store.get()[id];
  if (explicit) return explicit;
  const e = getEntry(id);
  if (e) {
    if (
      e.total > 0 &&
      (e.watched.length >= e.total || e.watched.includes(e.total))
    ) {
      return 'COMPLETED';
    }
    if (e.watched.length > 0 || e.sec > 5) return 'CURRENT';
  }
  if (inWatchlist(id)) return 'PLANNING';
  return null;
};
