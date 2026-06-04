import { useEffect, useRef, useState } from 'react';

import {
  ChevronDownIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from '@heroicons/react/outline';

import { getAiredContext } from '@utility/companionContext';
import {
  COMPANION_TONES,
  setMature,
  setTone,
  toneLabel,
  useCompanionPrefs,
  type CompanionTone,
} from '@utility/companionPrefs';
import {
  appendMessage,
  getThread,
  setThread,
  useCompanionThread,
} from '@utility/companionThread';

// In-player AI watch companion. Grounds each reply on the title + a spoiler-safe
// window of subtitle lines the player has actually shown (via getAiredContext),
// and talks in the viewer's chosen tone. Anonymous and best-effort: when no API
// key is configured it shows a friendly setup note instead of failing loudly.
// Design tokens + brand voice per docs/DESIGN.md and docs/STREAMING-ROADMAP.md §11.

export interface CompanionSeed {
  title: string;
  synopsis: string;
  genres: string[];
  format: string;
  // Low-spoiler cast roster (names + role + JP voice actor only, no bios) so the
  // companion can answer "wait, who was that?" without inventing anything.
  roster?: { name: string; role?: string; va?: string }[];
}

// mm:ss for the per-message episode timestamp ("you asked at 12:34").
const fmtTime = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const CompanionChat: React.FC<{
  seed: CompanionSeed;
  animeId: number;
  episode: number;
  total: number;
  // 'dock' = the fullscreen right-side panel: fills its container's full height
  // (no card chrome). 'panel' = the windowed right-rail card.
  variant?: 'panel' | 'dock';
}> = ({ seed, animeId, episode, total, variant = 'panel' }) => {
  const prefs = useCompanionPrefs();

  // The conversation lives in the shared per-episode thread store, so it
  // persists across reloads AND renders identically in the right-rail panel and
  // the fullscreen dock (both mount this component with the same animeId+episode).
  const messages = useCompanionThread(animeId, episode);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [toneOpen, setToneOpen] = useState(false);
  const [confirmMature, setConfirmMature] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // One-shot status probe so we can show chat vs. the setup note up front.
  useEffect(() => {
    let alive = true;
    fetch('/api/companion')
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

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (): Promise<void> => {
    const text = input.trim();
    if (!text || busy) return;

    // Grab the live playback position first so the turn is stamped with the
    // episode minute it happened at, then write the user turn through the shared
    // store (the other panel may have appended since this render).
    const aired = getAiredContext();
    const at = aired?.current;
    const history = getThread(animeId, episode);
    setThread(
      animeId,
      episode,
      history.concat({ role: 'user', content: text, t: at })
    );
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed,
          episode,
          total,
          tone: prefs.tone,
          mature: prefs.mature,
          window: aired?.lines ?? [],
          roster: seed.roster ?? [],
          messages: history.slice(-10),
          message: text,
        }),
      });

      if (res.status === 503) {
        setConfigured('no');
        return;
      }
      if (!res.ok) {
        setError('I lost the signal there. Give it another shot in a sec.');
        return;
      }
      const data = (await res.json()) as { reply?: string };
      if (data.reply) {
        appendMessage(animeId, episode, {
          role: 'assistant',
          content: data.reply,
          t: at,
        });
      } else {
        setError('I blanked on that one. Try asking again?');
      }
    } catch {
      setError('I lost the signal there. Give it another shot in a sec.');
    } finally {
      setBusy(false);
    }
  };

  const pickTone = (id: CompanionTone, mature?: boolean): void => {
    if (mature && !prefs.mature) {
      setConfirmMature(true);
      return;
    }
    setTone(id);
    setToneOpen(false);
    setConfirmMature(false);
  };

  const enableMature = (): void => {
    setMature(true);
    setTone('unhinged');
    setToneOpen(false);
    setConfirmMature(false);
  };

  return (
    <div
      className={`flex flex-col overflow-hidden bg-canvas-2/95 ${
        variant === 'dock'
          ? 'h-full'
          : 'h-[30rem] max-h-[72vh] rounded-2xl border border-line/60 shadow-card lg:h-[34rem]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
            <SparklesIcon className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-fg">
              Watch companion
            </p>
            <p className="text-[11px] text-faint">in the next seat</p>
          </div>
        </div>

        {/* Tone picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setToneOpen((v) => !v);
              setConfirmMature(false);
            }}
            className="flex items-center gap-1 rounded-full border border-line/60 px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-fg"
            aria-haspopup="menu"
            aria-expanded={toneOpen}
          >
            {toneLabel(prefs.tone)}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>

          {toneOpen && (
            <>
              <button
                type="button"
                aria-label="Close tone menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => {
                  setToneOpen(false);
                  setConfirmMature(false);
                }}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-line/60 bg-canvas-2 p-1 shadow-lift">
                {COMPANION_TONES.map((t) => {
                  const locked = Boolean(t.mature) && !prefs.mature;
                  const active = prefs.tone === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTone(t.id, t.mature)}
                      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                        active
                          ? 'bg-surface text-fg'
                          : 'text-muted hover:bg-surface/70 hover:text-fg'
                      }`}
                    >
                      <span className="mt-0.5">
                        {locked ? (
                          <LockClosedIcon className="h-3.5 w-3.5 text-faint" />
                        ) : (
                          <span
                            className={`block h-2 w-2 rounded-full ${
                              active ? 'bg-accent' : 'bg-line'
                            }`}
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {t.label}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {t.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {confirmMature && (
                  <div className="m-1 rounded-lg border border-line/60 bg-surface/60 p-2.5">
                    <p className="text-[11px] leading-snug text-muted">
                      Off the rails is 18+. It gets crude and sweary. Turn it
                      on?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={enableMature}
                        className="rounded-full bg-aurora px-2.5 py-1 text-[11px] font-semibold text-accent-ink shadow-glow active:scale-95"
                      >
                        Turn it on
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmMature(false)}
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-fg"
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {configured === 'no' ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-accent">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display text-sm font-bold text-fg">
            Almost showtime
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The companion is wired in, it just needs a key. Drop a free Google
            AI Studio key into{' '}
            <code className="rounded bg-surface px-1 py-0.5 text-[11px] text-fg">
              COMPANION_API_KEY
            </code>{' '}
            and restart, then I will be right here in the next seat.
          </p>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-3 rounded-full bg-aurora px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow transition active:scale-95"
          >
            Get a free key
          </a>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <p className="font-display text-sm font-bold text-fg">
                Pull up a seat
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                I only know what has played so far, so say what you are thinking
                and I will keep up. No spoilers from me.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={`flex flex-col ${
                m.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <p
                className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-br-sm bg-aurora text-accent-ink'
                    : 'max-w-[92%] rounded-bl-sm border border-line/50 bg-surface/70 text-fg'
                }`}
              >
                {m.content}
              </p>
              {m.role === 'user' && typeof m.t === 'number' && (
                <span className="mt-0.5 px-1 text-[10px] text-faint">
                  at {fmtTime(m.t)}
                </span>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <span className="flex gap-1 rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          )}

          {error && (
            <p className="text-center text-[11px] text-accent">{error}</p>
          )}
        </div>
      )}

      {/* Composer */}
      {configured !== 'no' && (
        <div className="border-t border-line/50 px-3 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Talk about this episode…"
              className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-line/60 bg-surface/50 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-aurora text-accent-ink shadow-glow transition active:scale-95 disabled:opacity-40"
            >
              <PaperAirplaneIcon className="h-5 w-5 rotate-90" />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-faint">
            Spoiler-safe: I only know up to where you have watched.
          </p>
        </div>
      )}
    </div>
  );
};

export default CompanionChat;
