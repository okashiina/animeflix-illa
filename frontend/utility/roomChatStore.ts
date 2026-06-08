import { useSyncExternalStore } from 'react';

import type { RoomConnection } from './realtime';

// Shared, ephemeral feed for the active co-watch room: chat lines, companion
// replies, AND playback activity ("Illa paused at 12:43", "Rin jumped to
// 18:40"). Lifted out of the RoomChat component so the right-rail panel and the
// fullscreen dock render the SAME feed (mirrors how the companion uses
// companionThread). A single Ably subscription owns incoming events — attached
// on join, detached on leave — so mounting two RoomChat views never
// double-counts a remote event. Our own actions are recorded locally (Ably
// echoMessages:false means we don't receive them back), so no duplication.

export interface RoomMsg {
  id: string;
  kind: 'user' | 'companion' | 'activity';
  name?: string;
  text: string;
  self?: boolean;
  // Activity-only: what happened, the episode position it happened at, and the
  // wall-clock time.
  action?: 'play' | 'pause' | 'seek';
  posSec?: number;
  at?: number;
}

let seq = 0;
export const roomMsgId = (): string => {
  seq += 1;
  return `m${seq}-${seq.toString(36)}`;
};

let messages: RoomMsg[] = [];
const EMPTY: RoomMsg[] = [];
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

// Unread "poke": a count that ticks up when a chat/companion line arrives while
// nobody is looking at the room panel (the viewer is on another tab or has the
// dock closed), so the Together tab can badge it. `activeCount` is the number of
// mounted RoomChat views; while one is open, messages are read immediately.
let unread = 0;
let activeCount = 0;
const unreadListeners = new Set<() => void>();
const emitUnread = (): void => unreadListeners.forEach((l) => l());

export const markRoomActive = (): void => {
  activeCount += 1;
  if (unread !== 0) {
    unread = 0;
    emitUnread();
  }
};
export const markRoomInactive = (): void => {
  activeCount = Math.max(0, activeCount - 1);
};

export const useRoomUnread = (): number =>
  useSyncExternalStore(
    (cb) => {
      unreadListeners.add(cb);
      return () => unreadListeners.delete(cb);
    },
    () => unread,
    () => 0
  );

export const pushRoomMessage = (m: RoomMsg): void => {
  messages = [...messages.slice(-120), m];
  // Badge incoming chatter (not our own, not ambient activity lines) when the
  // room panel isn't open.
  if (
    !m.self &&
    activeCount === 0 &&
    (m.kind === 'user' || m.kind === 'companion')
  ) {
    unread += 1;
    emitUnread();
  }
  emit();
};

export const clearRoomMessages = (): void => {
  if (unread !== 0) {
    unread = 0;
    emitUnread();
  }
  if (messages.length) {
    messages = [];
    emit();
  }
};

// Resolve a clientId to a display name. Set at attach time so the store doesn't
// have to import the room module (which imports this one).
let resolveName: (clientId: string) => string = () => 'someone';

/**
 * Record a playback action in the feed. Used both for our own actions (self) and
 * for remote ones over the channel. Consecutive same-actor/same-kind actions
 * within a short window collapse into one line, so scrubbing doesn't spam.
 */
export const recordActivity = (a: {
  clientId: string;
  action: 'play' | 'pause' | 'seek';
  posSec: number;
  at: number;
  self?: boolean;
}): void => {
  const name = a.self ? 'You' : resolveName(a.clientId);
  const last = messages[messages.length - 1];
  if (
    last &&
    last.kind === 'activity' &&
    last.action === a.action &&
    last.name === name &&
    a.at - (last.at ?? 0) < 1500
  ) {
    messages = [
      ...messages.slice(0, -1),
      { ...last, posSec: a.posSec, at: a.at },
    ];
    emit();
    return;
  }
  pushRoomMessage({
    id: roomMsgId(),
    kind: 'activity',
    name,
    text: '',
    self: a.self,
    action: a.action,
    posSec: a.posSec,
    at: a.at,
  });
};

let detach: (() => void) | null = null;

/** Subscribe the store to a room's realtime channel. Called once per join. */
export const attachRoomChat = (
  conn: RoomConnection,
  nameOf: (clientId: string) => string
): void => {
  detach?.();
  clearRoomMessages();
  resolveName = nameOf;
  const offChat = conn.subscribe('chat', (data) => {
    const d = (data || {}) as { name?: string; text?: string };
    if (d.text)
      pushRoomMessage({
        id: roomMsgId(),
        kind: 'user',
        name: d.name,
        text: d.text,
      });
  });
  const offBot = conn.subscribe('companion', (data) => {
    const d = (data || {}) as { text?: string };
    if (d.text)
      pushRoomMessage({ id: roomMsgId(), kind: 'companion', text: d.text });
  });
  const offAct = conn.subscribe('activity', (data, from) => {
    const d = (data || {}) as {
      action?: 'play' | 'pause' | 'seek';
      position?: number;
      at?: number;
    };
    if (d.action)
      recordActivity({
        clientId: from,
        action: d.action,
        posSec: typeof d.position === 'number' ? d.position : 0,
        at: d.at ?? 0,
      });
  });
  detach = () => {
    offChat();
    offBot();
    offAct();
  };
};

/** Tear down the subscription and clear history (called on leave). */
export const detachRoomChat = (): void => {
  detach?.();
  detach = null;
  resolveName = () => 'someone';
  clearRoomMessages();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRoomMessages = (): RoomMsg[] =>
  useSyncExternalStore(
    subscribe,
    () => messages,
    () => EMPTY
  );
