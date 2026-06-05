import { useCallback, useEffect, useRef, useState } from 'react';

import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/outline';

import type { CompanionSeed } from '@components/watch/CompanionChat';
import { getAiredContext } from '@utility/companionContext';
import { getRoomConnection } from '@utility/room';

// The room's side chat: people talking over the same episode, plus the watch
// companion when someone calls it in. Messages ride the room's realtime channel
// and are ephemeral (a live conversation, not saved history). The companion
// reuses the normal /api/companion route untouched; because the room keeps
// everyone's playback locked together, the asker's spoiler-safe window is also
// everyone's, so a called-in answer can't get ahead of the slowest seat.

interface RoomMsg {
  id: string;
  kind: 'user' | 'companion';
  name?: string;
  text: string;
  self?: boolean;
}

let msgSeq = 0;
const nextId = (): string => {
  msgSeq += 1;
  return `m${msgSeq}-${Date.now().toString(36)}`;
};

const RoomChat: React.FC<{
  selfName: string;
  companion: { seed: CompanionSeed; episode: number; total: number };
}> = ({ selfName, companion }) => {
  const [msgs, setMsgs] = useState<RoomMsg[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const push = useCallback((m: RoomMsg): void => {
    setMsgs((list) => [...list.slice(-80), m]);
  }, []);

  // Wire incoming chat + companion broadcasts from the room channel.
  useEffect(() => {
    const conn = getRoomConnection();
    if (!conn) return undefined;
    const offChat = conn.subscribe('chat', (data) => {
      const d = (data || {}) as { name?: string; text?: string };
      if (d.text)
        push({ id: nextId(), kind: 'user', name: d.name, text: d.text });
    });
    const offBot = conn.subscribe('companion', (data) => {
      const d = (data || {}) as { text?: string };
      if (d.text) push({ id: nextId(), kind: 'companion', text: d.text });
    });
    return () => {
      offChat();
      offBot();
    };
  }, [push]);

  // Keep the latest line in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const sendChat = (): void => {
    const text = input.trim();
    if (!text) return;
    const conn = getRoomConnection();
    if (!conn) return;
    conn.publish('chat', { name: selfName, text });
    push({ id: nextId(), kind: 'user', name: selfName, text, self: true });
    setInput('');
  };

  // Call the companion into the room: post the question as a normal chat line so
  // everyone sees what was asked, fetch a grounded reply, then broadcast it.
  const askCompanion = async (): Promise<void> => {
    const text = input.trim();
    if (!text || asking) return;
    const conn = getRoomConnection();
    if (!conn) return;
    conn.publish('chat', { name: selfName, text });
    push({ id: nextId(), kind: 'user', name: selfName, text, self: true });
    setInput('');
    setAsking(true);
    try {
      const aired = getAiredContext();
      const res = await fetch('/api/companion?nostream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: companion.seed,
          episode: companion.episode,
          total: companion.total,
          window: aired?.lines ?? [],
          roster: companion.seed.roster ?? [],
          studios: companion.seed.studios ?? [],
          message: text,
        }),
      });
      const data = (await res.json()) as { reply?: string };
      const reply = (data.reply || '').trim();
      if (reply) {
        conn.publish('companion', { text: reply });
        push({ id: nextId(), kind: 'companion', text: reply });
      }
    } catch {
      /* a missed answer just doesn't show; the chat keeps going */
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex h-72 flex-col overflow-hidden rounded-xl border border-line/50 bg-canvas">
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5"
      >
        {msgs.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-faint">
            Say something to the room, or tap the spark to pull the companion
            in. Nobody gets ahead of the slowest seat.
          </p>
        ) : (
          msgs.map((m) =>
            m.kind === 'companion' ? (
              <div key={m.id} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-aurora text-accent-ink">
                  <SparklesIcon className="h-3 w-3" />
                </span>
                <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-accent/30 bg-surface/70 px-2.5 py-1.5 text-xs leading-relaxed text-fg">
                  {m.text}
                </p>
              </div>
            ) : (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.self ? 'items-end' : 'items-start'
                }`}
              >
                {!m.self && m.name && (
                  <span className="px-1 text-[10px] font-semibold text-faint">
                    {m.name}
                  </span>
                )}
                <p
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-2.5 py-1.5 text-xs leading-relaxed ${
                    m.self
                      ? 'rounded-br-sm bg-aurora text-accent-ink'
                      : 'rounded-bl-sm border border-line/50 bg-surface/70 text-fg'
                  }`}
                >
                  {m.text}
                </p>
              </div>
            )
          )
        )}
      </div>

      <div className="border-t border-line/50 px-2 py-2">
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={askCompanion}
            disabled={asking || !input.trim()}
            aria-label="Ask the companion"
            title="Ask the companion"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line/60 bg-surface/50 text-muted transition hover:border-accent/50 hover:text-accent active:scale-95 disabled:opacity-40"
          >
            <SparklesIcon
              className={`h-4 w-4 ${asking ? 'animate-pulse' : ''}`}
            />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            rows={1}
            placeholder="Message the room…"
            className="max-h-20 min-h-[2.25rem] flex-1 resize-none rounded-lg border border-line/60 bg-surface/50 px-2.5 py-1.5 text-xs text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={!input.trim()}
            aria-label="Send to the room"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-aurora text-accent-ink shadow-glow transition active:scale-95 disabled:opacity-40"
          >
            <PaperAirplaneIcon className="h-4 w-4 rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomChat;
