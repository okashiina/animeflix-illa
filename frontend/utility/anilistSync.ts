import { authHeader, type AniListSession } from './anilistAuth';
import {
  getExplicitStatus,
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
// Model: on login we PULL the AniList list and merge it into the local stores
// (additive — never wipes local; the remote status is mirrored as the local
// explicit status). Thereafter local changes PUSH up: a status the user sets
// explicitly is sent as-is; a progress advance bumps the status forward only
// (PLANNING→CURRENT→COMPLETED) and never auto-rewrites a status it doesn't model
// (DROPPED / PAUSED / REPEATING). New entries are created; an emptied bookmark is
// deleted.

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
// Module state. The sync is intentionally CONSERVATIVE: it only ever *advances*
// progress and *adds* entries, and only deletes a bookmark that has no progress.
// It never downgrades progress or rewrites a status it doesn't model
// (DROPPED / PAUSED / REPEATING), so importing then re-syncing can't clobber a
// curated AniList list.
// ---------------------------------------------------------------------------

const entryIdByMedia = new Map<number, number>(); // mediaId -> MediaList entry id (for deletes)
const remoteProgress = new Map<number, number>(); // last-known AniList progress per mediaId
const remoteStatus = new Map<number, AniStatus>(); // last-known AniList status per mediaId
const totalByMedia = new Map<number, number>(); // episode count per mediaId (from pull)
const knownRemote = new Set<number>(); // mediaIds AniList already has
let lastWatchlist: Set<number> | null = null; // watchlist snapshot at last sync (delete detection)
let applyingRemote = false;

export const isApplyingRemote = (): boolean => applyingRemote;

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

const hasNoProgress = (id: number): boolean => {
  const e = getEntry(id);
  return !e || (e.watched.length === 0 && e.sec <= 5);
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
  media?: { episodes?: number | null } | null;
}
interface ListData {
  MediaListCollection?: {
    lists?: ({ entries?: (ListEntry | null)[] | null } | null)[] | null;
  } | null;
}

/** Pull the user's AniList anime list and merge it into the local stores. */
export const pullAndMerge = async (session: AniListSession): Promise<void> => {
  const data = await gql<ListData>(
    LIST_Q,
    { userId: session.user.id },
    session.token
  );
  const lists = data?.MediaListCollection?.lists ?? [];

  applyingRemote = true;
  try {
    lists.forEach((l) =>
      (l?.entries ?? []).forEach((e) => {
        if (!e || !e.mediaId) return;
        entryIdByMedia.set(e.mediaId, e.id);
        knownRemote.add(e.mediaId);
        remoteProgress.set(e.mediaId, e.progress ?? 0);
        const episodes = e.media?.episodes ?? undefined;
        if (episodes) totalByMedia.set(e.mediaId, episodes);
        addToWatchlist(e.mediaId);
        // Mirror AniList's status locally so the picker / tabs match it (and so
        // a later push doesn't see a phantom change).
        const status = normalizeStatus(e.status);
        if (status) {
          remoteStatus.set(e.mediaId, status);
          setExplicitStatus(e.mediaId, status);
        }
        if (typeof e.progress === 'number' && e.progress > 0) {
          mergeWatchedUpTo(e.mediaId, e.progress, episodes);
        }
      })
    );
  } finally {
    applyingRemote = false;
  }

  // Snapshot the watchlist so deletes are detected against the merged baseline.
  lastWatchlist = new Set(listWatchlistIds());
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
 * Push local changes up. See the module header for the rules. Creates + status
 * changes + progress advances first, then deletes emptied bookmarks.
 */
export const pushChanges = async (session: AniListSession): Promise<void> => {
  const { token } = session;
  const watchlistIds = listWatchlistIds();
  const watchlist = new Set(watchlistIds);
  const localIds = Array.from(
    new Set<number>([...watchlistIds, ...listProgressIds()])
  );

  const save = async (id: number, status: AniStatus, progress: number) => {
    const res = await gql<{
      SaveMediaListEntry?: { id: number; mediaId: number };
    }>(SAVE_M, { mediaId: id, status, progress }, token);
    const saved = res?.SaveMediaListEntry;
    if (saved?.id && saved.mediaId) {
      entryIdByMedia.set(saved.mediaId, saved.id);
      knownRemote.add(saved.mediaId);
    }
    remoteProgress.set(id, progress);
    remoteStatus.set(id, status);
  };

  // Creates + status changes + progress advances.
  // eslint-disable-next-line no-restricted-syntax
  for (const id of localIds) {
    const plan = planPush(id, watchlist.has(id));
    if (plan) {
      // eslint-disable-next-line no-await-in-loop
      await save(id, plan.status, plan.progress);
    }
  }

  // Deletes: bookmarks removed since the last sync that carry no progress.
  if (lastWatchlist) {
    const removed = Array.from(lastWatchlist);
    // eslint-disable-next-line no-restricted-syntax
    for (const id of removed) {
      // eslint-disable-next-line no-continue
      if (watchlist.has(id) || inWatchlist(id) || !hasNoProgress(id)) continue;
      const entryId = entryIdByMedia.get(id);
      // eslint-disable-next-line no-continue
      if (!entryId) continue;
      // eslint-disable-next-line no-await-in-loop
      await gql(DELETE_M, { id: entryId }, token);
      entryIdByMedia.delete(id);
      knownRemote.delete(id);
      remoteProgress.delete(id);
      remoteStatus.delete(id);
    }
  }

  lastWatchlist = watchlist;
};
