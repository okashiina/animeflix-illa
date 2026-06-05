import { authHeader, type AniListSession } from './anilistAuth';
import {
  getExplicitStatus,
  getStatusMap,
  setExplicitStatus,
  type AniStatus,
} from './listStatus';
import {
  getEntry,
  listProgressIds,
  mergeWatchedUpTo,
  type ProgressEntry,
} from './progress';
import { addToWatchlist, inWatchlist, listWatchlistIds } from './watchlist';

// Two-way AniList sync over the local stores. Reads/writes AniList directly via
// fetch (no @animeflix/api runtime in the client bundle). Best-effort: every
// network path is guarded, and anonymous use never depends on it.
//
// Model: on login we PULL the AniList list and merge it locally; thereafter
// local changes PUSH up. The local stores are the source of truth for the
// user's intent, so the pull must NOT clobber a change the user made here that
// has not been pushed yet. Two persisted intent records make that safe across a
// page refresh (when the in-memory sync state is wiped):
//   - tombstones: ids the user removed locally → force-delete on AniList and
//     never resurrect on a pull (fixes removed titles re-appearing).
//   - dirty:      ids whose explicit status the user just changed → keep the
//     local status over the remote one until the change is pushed (fixes e.g.
//     setting "Plan to Watch" not sticking after a refresh).
// A progress advance still bumps the status forward only and never rewrites a
// status it does not model (DROPPED / PAUSED / REPEATING).

const ENDPOINT = 'https://graphql.anilist.co';

const STATUSES: AniStatus[] = [
  'CURRENT',
  'PLANNING',
  'COMPLETED',
  'PAUSED',
  'DROPPED',
  'REPEATING',
];
const normalizeStatus = (raw?: string | null): AniStatus | undefined =>
  raw && (STATUSES as string[]).includes(raw) ? (raw as AniStatus) : undefined;

const VIEWER_Q = /* GraphQL */ 'query { Viewer { id name avatar { medium } } }';

const LIST_Q = /* GraphQL */ `
  query ($userId: Int!) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists {
        entries {
          id
          mediaId
          status
          progress
          updatedAt
          media {
            episodes
          }
        }
      }
    }
  }
`;

const SAVE_M = /* GraphQL */ `
  mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
    SaveMediaListEntry(
      mediaId: $mediaId
      status: $status
      progress: $progress
    ) {
      id
      mediaId
    }
  }
`;

const DELETE_M = /* GraphQL */ `
  mutation ($id: Int) {
    DeleteMediaListEntry(id: $id) {
      deleted
    }
  }
`;

interface GqlResult<T> {
  data?: T;
  errors?: unknown;
}

const gql = async <T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
  signal?: AbortSignal
): Promise<T | null> => {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? authHeader(token) : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    const json = (await res.json()) as GqlResult<T>;
    return json?.data ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// In-memory baseline (the last-seen remote state), rebuilt by every pull.
// ---------------------------------------------------------------------------

const entryIdByMedia = new Map<number, number>(); // mediaId -> MediaList entry id (for deletes)
const remoteProgress = new Map<number, number>(); // last-known AniList progress per mediaId
const remoteStatus = new Map<number, AniStatus>(); // last-known AniList status per mediaId
const totalByMedia = new Map<number, number>(); // episode count per mediaId (from pull)
const knownRemote = new Set<number>(); // mediaIds AniList already has
let pulledOnce = false; // a pull has completed this session (the baseline is real)
let applyingRemote = false;

export const isApplyingRemote = (): boolean => applyingRemote;

// ---------------------------------------------------------------------------
// Persisted intent layer (survives a refresh). Tombstones + dirty-status flags
// are what stop the next pull from clobbering an un-pushed local change.
// ---------------------------------------------------------------------------

const META_KEY = 'kessoku.anilist.sync.v1';
interface SyncMeta {
  tombstones: Record<number, number>; // mediaId -> removedAt (pending delete)
  dirty: Record<number, number>; // mediaId -> changedAt (status pending push)
}
let meta: SyncMeta = { tombstones: {}, dirty: {} };
let metaLoaded = false;

const loadMeta = (): void => {
  if (metaLoaded || typeof window === 'undefined') return;
  metaLoaded = true;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncMeta>;
      meta = {
        tombstones: parsed.tombstones ?? {},
        dirty: parsed.dirty ?? {},
      };
    }
  } catch {
    /* ignore a corrupt blob */
  }
};

const saveMeta = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota / private-mode failures */
  }
};

// Diff baseline for detecting genuine user edits (vs. our own remote writes).
let prevStatus: Record<number, AniStatus> | null = null;
let prevWatchlist: Set<number> | null = null;

const resetDiffBaseline = (): void => {
  prevStatus = { ...getStatusMap() };
  prevWatchlist = new Set(listWatchlistIds());
};

/** Seed the diff baseline on mount, before any user edit fires. */
export const initLocalBaseline = (): void => {
  loadMeta();
  resetDiffBaseline();
};

/**
 * Record what the user just changed locally, so the next pull won't override it
 * and the next push knows to send it. Called on every local store change. No-op
 * while we are applying a remote pull (those writes are ours, not the user's).
 */
export const noteLocalChange = (): void => {
  if (applyingRemote) {
    resetDiffBaseline();
    return;
  }
  loadMeta();
  const curStatus = getStatusMap();
  const curWl = new Set(listWatchlistIds());
  let changed = false;

  if (prevStatus) {
    const ps = prevStatus;
    Object.keys(curStatus).forEach((k) => {
      const id = Number(k);
      if (curStatus[id] !== ps[id]) {
        meta.dirty[id] = Date.now();
        delete meta.tombstones[id]; // it's on the list with a status
        changed = true;
      }
    });
  }

  if (prevWatchlist) {
    const pw = prevWatchlist;
    pw.forEach((id) => {
      if (!curWl.has(id)) {
        // Removed since the last snapshot → tombstone it (force-delete on push,
        // and don't let the next pull resurrect it).
        meta.tombstones[id] = Date.now();
        delete meta.dirty[id];
        changed = true;
      }
    });
    curWl.forEach((id) => {
      if (!pw.has(id) && meta.tombstones[id]) {
        // Re-added → cancel any pending delete.
        delete meta.tombstones[id];
        changed = true;
      }
    });
  }

  prevStatus = { ...curStatus };
  prevWatchlist = curWl;
  if (changed) saveMeta();
};

/** AniList "progress" = episodes completed. Highest watched, or mid-episode−1. */
const aniListProgress = (e?: ProgressEntry): number => {
  if (!e) return 0;
  const maxWatched = e.watched.length ? Math.max(...e.watched) : 0;
  const fromPos = e.sec > 5 && e.ep > 1 ? e.ep - 1 : 0;
  return Math.max(maxWatched, fromPos);
};

// Status implied purely by progress (PLANNING / CURRENT / COMPLETED).
const progressStatus = (id: number, progress: number): AniStatus => {
  const total = getEntry(id)?.total || totalByMedia.get(id) || 0;
  if (total > 0 && progress >= total) return 'COMPLETED';
  if (progress > 0) return 'CURRENT';
  return 'PLANNING';
};

interface ViewerData {
  Viewer?: {
    id: number;
    name: string;
    avatar?: { medium?: string | null } | null;
  } | null;
}

/** Resolve the authenticated viewer for a freshly minted token. */
export const fetchViewer = async (
  token: string
): Promise<AniListSession['user'] | null> => {
  const data = await gql<ViewerData>(VIEWER_Q, {}, token);
  const v = data?.Viewer;
  if (!v) return null;
  return { id: v.id, name: v.name, avatar: v.avatar?.medium ?? null };
};

interface ListEntry {
  id: number;
  mediaId: number;
  status?: string | null;
  progress?: number | null;
  updatedAt?: number | null; // unix seconds; the AniList entry's own last edit
  media?: { episodes?: number | null } | null;
}
interface ListData {
  MediaListCollection?: {
    lists?: ({ entries?: (ListEntry | null)[] | null } | null)[] | null;
  } | null;
}

/** Pull the user's AniList anime list and merge it into the local stores. */
export const pullAndMerge = async (session: AniListSession): Promise<void> => {
  loadMeta();
  const data = await gql<ListData>(
    LIST_Q,
    { userId: session.user.id },
    session.token
  );
  // A failed query must be a no-op: leave the local stores and the intent flags
  // (tombstones / dirty) untouched, and don't mark a baseline that doesn't exist
  // (otherwise a network blip could be read as "AniList has nothing" and clear
  // pending deletes). An empty-but-present list is a real, successful pull.
  if (!data) return;
  const lists = data.MediaListCollection?.lists ?? [];

  applyingRemote = true;
  try {
    lists.forEach((l) =>
      (l?.entries ?? []).forEach((e) => {
        if (!e || !e.mediaId) return;
        const m = e.mediaId;
        // Baseline always tracks AniList, even for tombstoned ids (the push
        // needs the entry id to delete them).
        entryIdByMedia.set(m, e.id);
        knownRemote.add(m);
        remoteProgress.set(m, e.progress ?? 0);
        const episodes = e.media?.episodes ?? undefined;
        if (episodes) totalByMedia.set(m, episodes);
        const status = normalizeStatus(e.status);
        if (status) remoteStatus.set(m, status);

        // Pending local delete → don't resurrect it; the next push removes it.
        if (meta.tombstones[m]) return;

        addToWatchlist(m);
        // Mirror AniList's status locally UNLESS the user has an un-pushed local
        // status change for this title (then local wins until it's pushed).
        if (status && !meta.dirty[m]) setExplicitStatus(m, status);
        if (typeof e.progress === 'number' && e.progress > 0) {
          // Carry AniList's real edit time so a pulled title sorts by when it
          // was actually watched, not the moment of the pull (which used to
          // stamp every synced entry as "just now" and flood Continue Watching).
          mergeWatchedUpTo(m, e.progress, episodes, (e.updatedAt ?? 0) * 1000);
        }
      })
    );
  } finally {
    applyingRemote = false;
  }

  pulledOnce = true;
  // The writes above were ours; reset the diff baseline so they aren't mistaken
  // for user edits on the next change event.
  resetDiffBaseline();
};

// Decide what (if anything) to push for one title, given its remote baseline.
const planPush = (
  id: number,
  inWl: boolean
): { status: AniStatus; progress: number } | null => {
  const progress = aniListProgress(getEntry(id));
  const explicit = getExplicitStatus(id);

  if (!knownRemote.has(id)) {
    // New on AniList: skip an empty, un-bookmarked, un-statused entry.
    if (progress <= 0 && !inWl && !explicit) return null;
    return { status: explicit ?? progressStatus(id, progress), progress };
  }

  const remoteSt = remoteStatus.get(id);
  const remoteProg = remoteProgress.get(id) ?? 0;
  let status = remoteSt ?? progressStatus(id, progress);
  let changed = false;

  if (explicit && explicit !== remoteSt) {
    status = explicit; // user set it explicitly — honour any direction
    changed = true;
  }
  if (progress > remoteProg) {
    changed = true;
    // Advance the status forward only, and only from the "natural" states, so a
    // DROPPED / PAUSED / COMPLETED entry isn't auto-rewritten by watching.
    if (
      !explicit &&
      (remoteSt === undefined ||
        remoteSt === 'PLANNING' ||
        remoteSt === 'CURRENT')
    ) {
      status = progressStatus(id, progress);
    }
  }

  return changed ? { status, progress: Math.max(progress, remoteProg) } : null;
};

/**
 * Push local changes up. Creates + status changes + progress advances first,
 * then deletes tombstoned (locally-removed) entries on AniList regardless of
 * progress. Clears each intent flag once its change lands.
 */
export const pushChanges = async (session: AniListSession): Promise<void> => {
  loadMeta();
  const { token } = session;
  const watchlistIds = listWatchlistIds();
  const watchlist = new Set(watchlistIds);
  const localIds = Array.from(
    new Set<number>([
      ...watchlistIds,
      ...listProgressIds(),
      ...Object.keys(meta.dirty).map(Number),
    ])
  );

  // Returns true only when AniList confirms the save. On failure we leave the
  // baseline alone and the caller keeps the dirty flag so it retries.
  const save = async (
    id: number,
    status: AniStatus,
    progress: number
  ): Promise<boolean> => {
    const res = await gql<{
      SaveMediaListEntry?: { id: number; mediaId: number };
    }>(SAVE_M, { mediaId: id, status, progress }, token);
    const saved = res?.SaveMediaListEntry;
    if (!saved?.id || !saved.mediaId) return false;
    entryIdByMedia.set(saved.mediaId, saved.id);
    knownRemote.add(saved.mediaId);
    remoteProgress.set(id, progress);
    remoteStatus.set(id, status);
    return true;
  };

  let metaChanged = false;

  // Creates + status changes + progress advances.
  // eslint-disable-next-line no-restricted-syntax
  for (const id of localIds) {
    // eslint-disable-next-line no-continue
    if (meta.tombstones[id]) continue; // being deleted below — don't re-create
    const plan = planPush(id, watchlist.has(id));
    let ok = true;
    if (plan) {
      // eslint-disable-next-line no-await-in-loop
      ok = await save(id, plan.status, plan.progress);
    }
    // Clear the dirty flag only when the push actually landed (or there was
    // nothing to send). A failed push keeps it, so the local status stays
    // protected from the next pull and is retried on the following sync.
    if (ok && meta.dirty[id] !== undefined) {
      delete meta.dirty[id];
      metaChanged = true;
    }
  }

  // Deletes: tombstoned ids → remove on AniList regardless of progress.
  const tombIds = Object.keys(meta.tombstones).map(Number);
  // eslint-disable-next-line no-restricted-syntax
  for (const id of tombIds) {
    if (inWatchlist(id)) {
      // Re-added in the meantime — cancel the delete.
      delete meta.tombstones[id];
      metaChanged = true;
      // eslint-disable-next-line no-continue
      continue;
    }
    const entryId = entryIdByMedia.get(id);
    if (entryId) {
      // eslint-disable-next-line no-await-in-loop
      const res = await gql<{
        DeleteMediaListEntry?: { deleted?: boolean | null };
      }>(DELETE_M, { id: entryId }, token);
      // Only drop the tombstone once AniList confirms the delete; a failed call
      // keeps it so the removal is retried (and the pull won't resurrect it).
      if (res?.DeleteMediaListEntry?.deleted) {
        entryIdByMedia.delete(id);
        knownRemote.delete(id);
        remoteProgress.delete(id);
        remoteStatus.delete(id);
        delete meta.tombstones[id];
        metaChanged = true;
      }
    } else if (pulledOnce && !knownRemote.has(id)) {
      // A successful pull has confirmed AniList doesn't have this id → nothing
      // to delete; clear the tombstone.
      delete meta.tombstones[id];
      metaChanged = true;
    }
    // Otherwise keep the tombstone and retry after the next successful pull.
  }

  if (metaChanged) saveMeta();
};
