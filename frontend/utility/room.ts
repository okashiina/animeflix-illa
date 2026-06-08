import { useSyncExternalStore } from 'react';

import {
  connectRoom,
  type MemberData,
  type RoomConnection,
  type RoomMember,
} from './realtime';
import { attachRoomChat, detachRoomChat } from './roomChatStore';
import { attachRoomOverlay, detachRoomOverlay } from './roomOverlayStore';

// The co-watch room: a single active room per tab, held as a module singleton so
// the sync engine (syncPlayer), the chat, and the UI all read one source of
// truth. State is in-memory and ephemeral (a room is a live session, not saved
// history); only the browser's stable clientId persists, so reconnects keep the
// same identity. The Ably specifics stay behind `RoomConnection` (realtime.ts).

export interface RoomState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  roomId: string | null;
  selfId: string | null;
  members: RoomMember[];
  error: string | null;
  // The member "driving" playback (leader-only co-watch). Everyone else follows
  // and their player controls are locked. null until a driver is known.
  leaderId: string | null;
}

const initial: RoomState = {
  status: 'idle',
  roomId: null,
  selfId: null,
  members: [],
  error: null,
  leaderId: null,
};

let state: RoomState = initial;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());
const set = (patch: Partial<RoomState>): void => {
  state = { ...state, ...patch };
  emit();
};

let conn: RoomConnection | null = null;
let memberUnsub: (() => void) | null = null;
let leaderOff: (() => void) | null = null;
let leaderBeat: ReturnType<typeof setInterval> | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

/** The active transport, for the sync engine and chat to publish/subscribe. */
export const getRoomConnection = (): RoomConnection | null => conn;
/** Current members, read without subscribing (used by the sync engine). */
export const getRoomMembers = (): RoomMember[] => state.members;
/** The current driver's clientId, read without subscribing (sync engine). */
export const getRoomLeaderId = (): string | null => state.leaderId;

// --- Leadership ------------------------------------------------------------
// Leader-only co-watch: one member drives playback, everyone else follows. The
// driver is announced over a `leader` event on the room channel. The opener
// claims it; it can be handed off; and if the driver leaves, the lowest clientId
// present deterministically takes over so a room never gets stuck driverless.

const LEADER_BEAT_MS = 5000;

const announceLeader = (id: string): void => {
  conn?.publish('leader', { leaderId: id });
};

// Settle leadership when it's unclear. Deterministic, no election: the lowest
// clientId among present members takes an empty seat. A fresh joiner (leaderId
// still null) waits a short grace first, since the real driver re-announces the
// moment it sees the join, so the joiner can't wrongly grab a taken seat.
const reconcileLeader = (): void => {
  if (!conn || !state.selfId) return;
  const ids = state.members.map((m) => m.clientId);
  if (!ids.length) return;
  if (state.leaderId === state.selfId) {
    // We drive: re-announce so anyone who just arrived learns it immediately.
    announceLeader(state.selfId);
    return;
  }
  if (state.leaderId && ids.includes(state.leaderId)) return; // a driver is present
  const claim = (): void => {
    if (!state.selfId) return;
    set({ leaderId: state.selfId });
    announceLeader(state.selfId);
  };
  if ([...ids].sort()[0] !== state.selfId) return; // not our turn to take it
  if (state.leaderId && !ids.includes(state.leaderId)) {
    claim(); // the known driver left: take over now
    return;
  }
  // Never learned a driver: give one a beat to announce, then take it if empty.
  if (graceTimer) return;
  graceTimer = setTimeout(() => {
    graceTimer = null;
    const now = state.members.map((m) => m.clientId);
    const open = !(state.leaderId && now.includes(state.leaderId));
    if (now.length && open && [...now].sort()[0] === state.selfId) claim();
  }, 2500);
};

/**
 * Hand the driver's seat to another member. Only the current leader may do this;
 * it applies locally and is broadcast so the whole room agrees on the new driver.
 */
export const transferLeader = (targetId: string): void => {
  if (!conn || state.leaderId !== state.selfId) return;
  if (targetId === state.selfId) return;
  if (!state.members.some((m) => m.clientId === targetId)) return;
  set({ leaderId: targetId });
  announceLeader(targetId);
};

const CID_KEY = 'kessoku.room.cid';
const randomId = (): string => {
  const c =
    typeof crypto !== 'undefined'
      ? (crypto as Crypto & { randomUUID?: () => string })
      : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};
const getClientId = (): string => {
  if (typeof window === 'undefined') return 'guest';
  try {
    const saved = window.localStorage.getItem(CID_KEY);
    if (saved) return saved;
    const cid = `u-${randomId()}`;
    window.localStorage.setItem(CID_KEY, cid);
    return cid;
  } catch {
    return `u-${Date.now().toString(36)}`;
  }
};

// Short, shareable, unambiguous room code (no 0/O/1/I/L). Crypto-backed when
// available so two people don't collide.
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newRoomCode = (len = 6): string => {
  let out = '';
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i += 1)
      out += ROOM_ALPHABET[buf[i] % ROOM_ALPHABET.length];
  } else {
    for (let i = 0; i < len; i += 1)
      out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return out;
};

export const normalizeRoomCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

/** What a room is watching, learned by peeking before a join. */
export interface RoomInfo {
  code: string;
  aid: string;
  episode?: number;
  title?: string;
}

/**
 * Look at a room without joining: connect, read who's present and what they're
 * watching, then disconnect. Used to route a joiner to the room's anime, and to
 * warn when they typed a code from a different show. Returns null for an unknown,
 * empty, or context-less room, in which case the caller falls back to a plain
 * join. The peek connection never enters presence, so peeking stays invisible.
 */
export const peekRoom = async (rawCode: string): Promise<RoomInfo | null> => {
  const code = normalizeRoomCode(rawCode);
  if (!code) return null;
  let peek: RoomConnection | null = null;
  try {
    peek = await connectRoom(code, `peek-${getClientId()}`.slice(0, 64));
    const members = await new Promise<RoomMember[]>((resolve) => {
      let settled = false;
      let off: (() => void) | null = null;
      const finish = (m: RoomMember[]): void => {
        if (settled) return;
        settled = true;
        off?.();
        resolve(m);
      };
      off = peek!.onMembers((m) => {
        if (m.length) finish(m);
      });
      // Cap the wait so an empty/dead room resolves instead of hanging the join.
      setTimeout(() => finish([]), 2500);
    });
    const withAnime = members.find((m) => m.data?.aid);
    const aid = withAnime?.data.aid;
    if (!aid) return null;
    return {
      code,
      aid,
      episode: withAnime?.data.episode,
      title: withAnime?.data.title,
    };
  } catch {
    return null;
  } finally {
    peek?.close();
  }
};

export const leaveRoom = async (): Promise<void> => {
  memberUnsub?.();
  memberUnsub = null;
  leaderOff?.();
  leaderOff = null;
  if (leaderBeat) {
    clearInterval(leaderBeat);
    leaderBeat = null;
  }
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  detachRoomChat();
  detachRoomOverlay();
  if (conn) {
    conn.close();
    conn = null;
  }
  state = initial;
  emit();
};

/**
 * Join a room by code; leaves any current room first. `asLeader` is set only by
 * createRoom: the opener drives playback first.
 */
export const joinRoom = async (
  roomId: string,
  identity: MemberData,
  asLeader = false
): Promise<void> => {
  await leaveRoom();
  const code = normalizeRoomCode(roomId);
  if (!code) {
    set({ status: 'error', error: 'That room code looks off.' });
    return;
  }
  set({ status: 'connecting', roomId: code, error: null, members: [] });
  try {
    const cid = getClientId();
    conn = await connectRoom(code, cid);
    memberUnsub = conn.onMembers((members) => {
      set({ members });
      // Membership changed: settle who drives (promote on a driver's exit, or
      // re-announce so a newcomer learns the current one).
      reconcileLeader();
    });
    // Learn who drives from the channel; joiners pick up the opener's announce.
    leaderOff = conn.subscribe('leader', (data) => {
      const id = (data as { leaderId?: unknown } | null)?.leaderId;
      if (typeof id === 'string' && id !== state.leaderId)
        set({ leaderId: id });
    });
    // Self-heal: the driver re-announces on a slow cadence so a missed event (or
    // a late joiner) always converges on the right leader.
    leaderBeat = setInterval(() => {
      if (state.leaderId === state.selfId && state.selfId)
        announceLeader(state.selfId);
    }, LEADER_BEAT_MS);
    // Activity lines resolve the actor's name off live presence.
    attachRoomChat(
      conn,
      (clientId) =>
        state.members.find((m) => m.clientId === clientId)?.data.name ||
        'someone'
    );
    attachRoomOverlay(conn);
    await conn.enter(identity);
    set({ status: 'connected', selfId: cid });
    // The opener drives first; tell the room (a no-op while alone, picked up the
    // moment someone joins via the membership re-announce above).
    if (asLeader) {
      set({ leaderId: cid });
      announceLeader(cid);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[room] join failed', err);
    conn = null;
    set({ status: 'error', error: 'Could not reach the room. Try again?' });
  }
};

/** Create a fresh room and join it as the driver; returns the new code. */
export const createRoom = async (identity: MemberData): Promise<string> => {
  const code = newRoomCode();
  await joinRoom(code, identity, true);
  return code;
};

/** Update our presence identity (e.g. after renaming). */
export const updateIdentity = (identity: MemberData): void => {
  conn?.update(identity).catch(() => undefined);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRoom = (): RoomState =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  );
