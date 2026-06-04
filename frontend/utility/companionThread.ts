import { useSyncExternalStore } from 'react';

import { createStore } from './externalStore';

// Persistent chat thread for the AI watch companion, keyed per
// `${animeId}:${episode}` so each episode keeps its own conversation. Built on
// the same localStorage-backed externalStore as companionPrefs: the snapshot is
// referentially stable (the hook would loop otherwise), cross-tab edits
// invalidate the cache, and SSR always returns the same empty reference.
//
// Two players can render the SAME thread at once — the right-rail companion and
// the fullscreen dock — so the store is the single source of truth and both
// stay in lockstep. We cap the map to the most-recently-touched ~10 episodes so
// localStorage never grows without bound.

export interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  // Playback position (seconds) when the turn was sent, so the chat can show
  // "at 12:34" of the episode. Optional + only set on the direct player.
  t?: number;
}

interface ThreadEntry {
  messages: ThreadMessage[];
  updatedAt: number;
}

type ThreadMap = Record<string, ThreadEntry>;

const KEY = 'kessoku.companion.thread.v1';
const MAX_THREADS = 10;
const emptyMap: ThreadMap = {};

const store = createStore<ThreadMap>(KEY, emptyMap);

// A single frozen empty array reused for every "no thread yet" read, so both the
// server snapshot and unseeded client reads return a STABLE reference and never
// trip React's "getSnapshot should be cached" warning/loop.
const EMPTY: ThreadMessage[] = [];

const keyFor = (animeId: number, episode: number): string =>
  `${animeId}:${episode}`;

// Per-key cache of the last messages array we handed out. As long as the
// underlying map entry is the same object, we return the same array reference;
// this keeps useSyncExternalStore happy across re-renders.
let mapCache: ThreadMap | null = null;
const msgCache: Record<string, ThreadMessage[]> = {};

const snapshotFor = (k: string): ThreadMessage[] => {
  const map = store.get();
  if (map !== mapCache) {
    // The map changed (a write happened or the cache was invalidated): drop the
    // per-key memo so stale arrays are not handed back.
    mapCache = map;
    Object.keys(msgCache).forEach((mk) => delete msgCache[mk]);
  }
  const entry = map[k];
  if (!entry || entry.messages.length === 0) return EMPTY;
  if (!msgCache[k]) msgCache[k] = entry.messages;
  return msgCache[k];
};

export const getThread = (animeId: number, episode: number): ThreadMessage[] =>
  snapshotFor(keyFor(animeId, episode));

// Write the thread for one episode, then prune the map down to the
// MAX_THREADS most-recently-updated keys so storage stays bounded.
export const setThread = (
  animeId: number,
  episode: number,
  msgs: ThreadMessage[]
): void => {
  const k = keyFor(animeId, episode);
  store.update((prev) => {
    const next: ThreadMap = { ...prev };
    next[k] = { messages: msgs, updatedAt: Date.now() };

    const keys = Object.keys(next);
    if (keys.length > MAX_THREADS) {
      const ordered = keys.sort(
        (a, b) => next[b].updatedAt - next[a].updatedAt
      );
      ordered.slice(MAX_THREADS).forEach((stale) => {
        delete next[stale];
      });
    }
    return next;
  });
};

export const appendMessage = (
  animeId: number,
  episode: number,
  msg: ThreadMessage
): void => {
  const current = getThread(animeId, episode);
  setThread(animeId, episode, current.concat(msg));
};

export const subscribeThread = (listener: () => void): (() => void) =>
  store.subscribe(listener);

// `EMPTY` is a stable reference, so getServerSnapshot never trips the
// "getSnapshot should be cached" loop during SSR; the client snapshot is memoised
// per key in snapshotFor.
export const useCompanionThread = (
  animeId: number,
  episode: number
): ThreadMessage[] => {
  const k = keyFor(animeId, episode);
  return useSyncExternalStore(
    store.subscribe,
    () => snapshotFor(k),
    () => EMPTY
  );
};
