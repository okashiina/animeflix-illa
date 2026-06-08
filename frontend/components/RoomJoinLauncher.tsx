import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/router';

import { UserGroupIcon } from '@heroicons/react/outline';

import { normalizeRoomCode, peekRoom } from '@utility/room';

// "Join a room by code" entry in the global header. A friend hands you a code;
// we peek at what that room is watching and route you straight to the anime,
// where the watch page auto-joins you. No Redux: this rides on every page,
// including ones that never load the store.

const ERROR_TEXT = "Room not found, or it isn't watching anything yet.";

const RoomJoinLauncher: React.FC = () => {
  const router = useRouter();
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Are rooms even wired up (is there an Ably key)? Mirrors RoomUI's probe.
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

  // Close the popover on an outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the field when the popover opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const onChange = (raw: string): void => {
    setCode(normalizeRoomCode(raw));
    if (error) setError(null);
  };

  const submit = async (): Promise<void> => {
    const c = normalizeRoomCode(code);
    if (!c || loading) return;
    setLoading(true);
    setError(null);
    try {
      const info = await peekRoom(c);
      if (info) {
        // The watch page reads ?room= and auto-joins; we only route there.
        setOpen(false);
        await router.push(
          `/watch/${info.aid}/?episode=${info.episode ?? 1}&room=${info.code}`
        );
        return;
      }
      setError(ERROR_TEXT);
    } catch {
      setError(ERROR_TEXT);
    } finally {
      setLoading(false);
    }
  };

  const onFormSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    submit();
  };

  // Rooms aren't configured (or we don't know yet): show nothing, like RoomUI.
  if (configured !== 'yes') return null;

  const disabled = loading || !code.trim();

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Join a room"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 ${
          open
            ? 'border-accent/50 bg-surface text-fg'
            : 'border-line/60 bg-surface/50 text-muted hover:border-accent/50 hover:text-fg'
        }`}
      >
        <UserGroupIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Join room</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Join a room"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line/60 bg-surface p-4 shadow-glow"
        >
          <form onSubmit={onFormSubmit} className="flex flex-col gap-2.5">
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-fg">
                Join a room
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Drop in a friend&apos;s code and watch in lockstep.
              </p>
            </div>
            <div className="flex w-full items-center gap-2">
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Room code"
                aria-label="Room code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-line/60 bg-surface/50 px-3 py-1.5 text-sm font-semibold tracking-[0.18em] text-fg placeholder:font-normal placeholder:tracking-normal placeholder:text-faint focus:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
              <button
                type="submit"
                disabled={disabled}
                className="shrink-0 rounded-lg bg-aurora px-3 py-1.5 text-sm font-semibold text-accent-ink shadow-glow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Finding the room…' : 'Join'}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-accent">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default RoomJoinLauncher;
