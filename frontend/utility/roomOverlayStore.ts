import { useSyncExternalStore } from 'react';

import type { RoomConnection } from './realtime';

// Transient on-video overlay events for the active co-watch room: danmaku
// (scrolling bullet comments) and reaction floaties (rising emoji). Unlike the
// chat feed (roomChatStore), these are NOT kept in a list — they fire, animate,
// and vanish, so this is a tiny pub/sub rather than a snapshot store. A single
// Ably subscription is attached on join and detached on leave (driven by room.ts),
// alongside the chat subscription. Our own sends are echoed locally because the
// connection uses echoMessages:false (we never receive our own publishes back).
//
// Live-only for v1: everyone in a room is playback-synced, so "show on arrival"
// == "show at this moment". Persistent, timestamp-indexed danmaku for solo
// viewers is a roadmap follow-up (needs a datastore).

export interface DanmakuItem {
  id: string;
  text: string;
  name?: string;
}
export interface ReactionItem {
  id: string;
  emoji: string;
}

const DANMAKU_MAX = 120;

let seq = 0;
const nextId = (): string => {
  seq += 1;
  return `ov${seq}`;
};

const danmakuSubs = new Set<(d: DanmakuItem) => void>();
const reactionSubs = new Set<(r: ReactionItem) => void>();

export const onDanmaku = (cb: (d: DanmakuItem) => void): (() => void) => {
  danmakuSubs.add(cb);
  return () => danmakuSubs.delete(cb);
};
export const onReaction = (cb: (r: ReactionItem) => void): (() => void) => {
  reactionSubs.add(cb);
  return () => reactionSubs.delete(cb);
};

const emitDanmaku = (d: DanmakuItem): void =>
  danmakuSubs.forEach((cb) => cb(d));
const emitReaction = (r: ReactionItem): void =>
  reactionSubs.forEach((cb) => cb(r));

let conn: RoomConnection | null = null;

/** True while a room is connected (drives the in-room-only send affordances). */
export const overlayActive = (): boolean => conn !== null;

export const sendDanmaku = (text: string, name?: string): void => {
  const t = text.trim().slice(0, DANMAKU_MAX);
  if (!t || !conn) return;
  conn.publish('danmaku', { text: t, name });
  emitDanmaku({ id: nextId(), text: t, name }); // self-echo (no Ably echo)
};

export const sendReaction = (emoji: string): void => {
  if (!emoji || !conn) return;
  conn.publish('reaction', { emoji });
  emitReaction({ id: nextId(), emoji });
};

let detach: (() => void) | null = null;

/** Subscribe to the room's overlay events. Called once per join (room.ts). */
export const attachRoomOverlay = (c: RoomConnection): void => {
  detach?.();
  conn = c;
  const offD = c.subscribe('danmaku', (data) => {
    const d = (data || {}) as { text?: string; name?: string };
    if (d.text)
      emitDanmaku({
        id: nextId(),
        text: d.text.slice(0, DANMAKU_MAX),
        name: d.name,
      });
  });
  const offR = c.subscribe('reaction', (data) => {
    const d = (data || {}) as { emoji?: string };
    if (d.emoji) emitReaction({ id: nextId(), emoji: d.emoji });
  });
  detach = () => {
    offD();
    offR();
  };
};

/** Tear down the overlay subscription (called on leave). */
export const detachRoomOverlay = (): void => {
  detach?.();
  detach = null;
  conn = null;
};

// --- Danmaku visibility (a viewer preference, controlled from the room panel,
// read by the on-video overlay). Lives here so the two surfaces share one flag. ---

const DANMAKU_KEY = 'kessoku.danmaku.on';
let danmakuOn = true;
if (typeof window !== 'undefined') {
  try {
    danmakuOn = window.localStorage.getItem(DANMAKU_KEY) !== 'off';
  } catch {
    /* ignore */
  }
}
const visSubs = new Set<() => void>();

export const toggleDanmaku = (): void => {
  danmakuOn = !danmakuOn;
  try {
    window.localStorage.setItem(DANMAKU_KEY, danmakuOn ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  visSubs.forEach((cb) => cb());
};

export const useDanmakuOn = (): boolean =>
  useSyncExternalStore(
    (cb) => {
      visSubs.add(cb);
      return () => visSubs.delete(cb);
    },
    () => danmakuOn,
    () => true
  );
