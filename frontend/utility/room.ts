import { useSyncExternalStore } from 'react';

import {
  connectRoom,
  type MemberData,
  type RoomConnection,
  type RoomMember,
} from './realtime';
import { attachRoomChat, detachRoomChat } from './roomChatStore';

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
}

const initial: RoomState = {
  status: 'idle',
  roomId: null,
  selfId: null,
  members: [],
  error: null,
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

/** The active transport, for the sync engine and chat to publish/subscribe. */
export const getRoomConnection = (): RoomConnection | null => conn;
/** Current members, read without subscribing (used by the sync engine). */
export const getRoomMembers = (): RoomMember[] => state.members;

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

export const leaveRoom = async (): Promise<void> => {
  memberUnsub?.();
  memberUnsub = null;
  detachRoomChat();
  if (conn) {
    conn.close();
    conn = null;
  }
  state = initial;
  emit();
};

/** Join a room by code; leaves any current room first. */
export const joinRoom = async (
  roomId: string,
  identity: MemberData
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
    memberUnsub = conn.onMembers((members) => set({ members }));
    // Activity lines resolve the actor's name off live presence.
    attachRoomChat(
      conn,
      (clientId) =>
        state.members.find((m) => m.clientId === clientId)?.data.name ||
        'someone'
    );
    await conn.enter(identity);
    set({ status: 'connected', selfId: cid });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[room] join failed', err);
    conn = null;
    set({ status: 'error', error: 'Could not reach the room. Try again?' });
  }
};

/** Create a fresh room and join it; returns the new code. */
export const createRoom = async (identity: MemberData): Promise<string> => {
  const code = newRoomCode();
  await joinRoom(code, identity);
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
