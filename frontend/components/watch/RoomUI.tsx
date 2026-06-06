import { useEffect, useState } from 'react';

import {
  ClipboardCheckIcon,
  LinkIcon,
  LogoutIcon,
  UserGroupIcon,
} from '@heroicons/react/outline';

import type { CompanionSeed } from '@components/watch/CompanionChat';
import RoomChat from '@components/watch/RoomChat';
import { getSession } from '@utility/anilistAuth';
import { subscribePlayerHandle } from '@utility/playerBus';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  normalizeRoomCode,
  useRoom,
} from '@utility/room';

// Teleparty co-watch panel: spin up or join a room, see who's in, share the
// invite, and chat (companion included). Playback sync itself runs page-level
// (useSyncPlayer) so it survives tab switches; this is the room's face.

const NICK_KEY = 'kessoku.room.nick';

const RoomUI: React.FC<{
  initialCode?: string;
  companion: { seed: CompanionSeed; episode: number; total: number };
  // 'panel' = the windowed right-rail card. 'dock' = fills the fullscreen dock's
  // height with no card chrome (mirrors CompanionChat's variants).
  variant?: 'panel' | 'dock';
}> = ({ initialCode, companion, variant = 'panel' }) => {
  const isDock = variant === 'dock';
  const room = useRoom();
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [hasPlayer, setHasPlayer] = useState(false);
  const [nick, setNick] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [code, setCode] = useState(
    initialCode ? normalizeRoomCode(initialCode) : ''
  );
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Are rooms even wired up (is there an Ably key)?
  useEffect(() => {
    let alive = true;
    fetch('/api/room/token?probe=1')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setConfigured(d?.configured ? 'yes' : 'no');
      })
      .catch(() => {
        if (alive) setConfigured('no');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Sync needs our direct player; the embed registers no handle.
  useEffect(() => subscribePlayerHandle((h) => setHasPlayer(Boolean(h))), []);

  // Identity: an AniList handle if signed in, else a remembered nickname.
  useEffect(() => {
    const s = getSession();
    if (s?.user) {
      setNick((n) => n || s.user.name);
      setAvatar(s.user.avatar || undefined);
      return;
    }
    try {
      const saved = window.localStorage.getItem(NICK_KEY);
      if (saved) setNick((n) => n || saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Build the shareable invite once we're in a room.
  useEffect(() => {
    if (room.status === 'connected' && room.roomId) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', room.roomId);
        setShareUrl(u.toString());
      } catch {
        setShareUrl('');
      }
    }
  }, [room.status, room.roomId]);

  const identity = (): { name: string; avatar?: string } => {
    const name = (nick.trim() || 'guest').slice(0, 24);
    try {
      window.localStorage.setItem(NICK_KEY, name);
    } catch {
      /* ignore */
    }
    return { name, avatar };
  };

  const onJoin = (): void => {
    const c = normalizeRoomCode(code);
    if (c) joinRoom(c, identity());
  };

  const copyShare = async (): Promise<void> => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  // --- Not configured: honest setup note. ---
  if (configured === 'no') {
    return (
      <div
        className={`flex flex-col items-center bg-canvas-2/95 px-6 py-8 text-center ${
          isDock
            ? 'h-full justify-center'
            : 'rounded-2xl border border-line/60 shadow-card'
        }`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-accent">
          <UserGroupIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display text-sm font-bold text-fg">
          Watch parties need a key
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Drop a free Ably key into{' '}
          <code className="rounded bg-surface px-1 py-0.5 text-[11px] text-fg">
            ABLY_API_KEY
          </code>{' '}
          and restart, then send a friend the link and watch in lockstep.
        </p>
        <a
          href="https://ably.com/sign-up"
          target="_blank"
          rel="noreferrer"
          className="mt-3 rounded-full bg-aurora px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow transition active:scale-95"
        >
          Get a free Ably key
        </a>
      </div>
    );
  }

  // --- Connected: the room. ---
  if (room.status === 'connected') {
    return (
      <div
        className={`flex flex-col gap-3 bg-canvas-2/95 p-3 ${
          isDock ? 'h-full' : 'rounded-2xl border border-line/60 shadow-card'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
              <UserGroupIcon className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-fg">
                In the room
              </p>
              <p className="text-[11px] text-faint">
                {room.members.length} watching together
              </p>
            </div>
          </div>
          <span className="rounded-full border border-line/60 bg-surface px-2.5 py-1 text-xs font-semibold tracking-[0.18em] text-fg">
            {room.roomId}
          </span>
        </div>

        {!hasPlayer && (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/90">
            Sync rides our own player. On the embed you&apos;ll still share the
            chat, just not the playback.
          </p>
        )}

        {/* Invite link */}
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="truncate text-[11px] text-muted">
              {shareUrl || 'preparing invite…'}
            </span>
          </div>
          <button
            type="button"
            onClick={copyShare}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line/60 bg-surface/50 text-muted transition hover:border-accent/50 hover:text-accent active:scale-95"
            aria-label="Copy invite link"
            title="Copy invite link"
          >
            {copied ? (
              <ClipboardCheckIcon className="h-4 w-4 text-accent" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Members */}
        <div className="flex flex-wrap gap-1.5">
          {room.members.map((m) => {
            const isSelf = m.clientId === room.selfId;
            return (
              <span
                key={m.clientId}
                className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] font-medium ${
                  isSelf
                    ? 'border-accent/40 bg-surface text-fg'
                    : 'border-line/60 bg-surface/50 text-muted'
                }`}
              >
                {m.data.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatar; next/image adds no value here
                  <img
                    src={m.data.avatar}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-aurora text-[10px] font-bold text-accent-ink">
                    {(m.data.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                {m.data.name || 'guest'}
                {isSelf && <span className="text-faint">you</span>}
              </span>
            );
          })}
        </div>

        <RoomChat
          selfName={nick.trim() || 'guest'}
          companion={companion}
          fill={isDock}
        />

        <button
          type="button"
          onClick={() => leaveRoom()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/60 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-fg active:scale-95"
        >
          <LogoutIcon className="h-3.5 w-3.5" />
          Leave the room
        </button>
      </div>
    );
  }

  // --- Lobby: create or join. ---
  const connecting = room.status === 'connecting' || configured === 'unknown';
  return (
    <div
      className={`flex flex-col gap-3 bg-canvas-2/95 p-4 ${
        isDock
          ? 'h-full justify-center'
          : 'rounded-2xl border border-line/60 shadow-card'
      }`}
    >
      <div>
        <p className="font-display text-sm font-bold text-fg">Watch together</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Spin up a room, send the link, and the show stays in lockstep. One of
          you hits pause, everyone pauses.
        </p>
      </div>

      {!hasPlayer && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/90">
          Heads up: lockstep playback rides our own player. On the embed you can
          still chat, just not sync.
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">
          Your name
        </span>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={24}
          placeholder="what should the room call you?"
          className="w-full rounded-lg border border-line/60 bg-surface/50 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => createRoom(identity())}
        disabled={connecting}
        className="rounded-lg bg-aurora px-3 py-2 text-sm font-semibold text-accent-ink shadow-glow transition active:scale-95 disabled:opacity-50"
      >
        {room.status === 'connecting' ? 'Opening the room…' : 'Start a room'}
      </button>

      <div className="flex items-center gap-2 text-[11px] text-faint">
        <span className="h-px flex-1 bg-line/60" />
        or join one
        <span className="h-px flex-1 bg-line/60" />
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onJoin();
          }}
          placeholder="Room code"
          className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface/50 px-3 py-2 text-sm font-semibold tracking-[0.18em] text-fg placeholder:font-normal placeholder:tracking-normal placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={connecting || !code.trim()}
          className="rounded-lg border border-line/60 px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent/50 active:scale-95 disabled:opacity-50"
        >
          Join
        </button>
      </div>

      {room.status === 'error' && room.error && (
        <p className="text-center text-[11px] text-accent">{room.error}</p>
      )}
    </div>
  );
};

export default RoomUI;
