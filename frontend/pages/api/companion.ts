import type { NextApiRequest, NextApiResponse } from 'next';

// AI watch companion endpoint. Grounds an LLM on the current title + a
// spoiler-safe window of subtitle lines (everything aired up to the viewer's
// current timestamp) and replies in a chosen persona tone. Talks to any
// OpenAI-compatible chat endpoint, so the default free Gemini today and a local
// Ollama later are the same code with a different base URL. The API key is
// read server-side only and never reaches the browser (same posture as
// /api/auth/anilist). See docs/STREAMING-ROADMAP.md §11.

const API_BASE = (
  process.env.COMPANION_API_BASE ||
  'https://generativelanguage.googleapis.com/v1beta/openai'
).replace(/\/$/, '');
const API_KEY = process.env.COMPANION_API_KEY || '';
// gemini-2.5-flash is the default: the older gemini-2.0-flash free tier is now
// zeroed for new keys (429 RESOURCE_EXHAUSTED, limit: 0), while 2.5-flash still
// has free quota. Override with COMPANION_MODEL (e.g. gemini-2.5-flash-lite).
const MODEL = process.env.COMPANION_MODEL || 'gemini-2.5-flash';

// --- Persona ---------------------------------------------------------------
// The companion is the friend in the next seat at a tiny live house. Voice is a
// brand-copywriter job (kessoku band flavour); the hard rules below are what
// keep it from spoiling.
const BASE_VOICE = `You are kessoku's watch companion: the friend in the next seat at a small live house, watching this episode next to the viewer. You talk about the show as it plays, react with them, and answer "wait, who was that again?" without making it weird.

Voice: warm, a little shy but quick to light up at a good cut or a good line. Light band-and-stage energy, never forced. Keep replies short, like texting while watching, a sentence or three. Speak the viewer's language: if they write Indonesian, answer in Indonesian; if English, English; mirror whatever mix they use. No emoji spam, no lecturing, no walls of text.

Be specific, not generic. React to the actual moment in front of you: name the character who just spoke, the line that landed, the shot or the beat the viewer is reacting to. Skip empty filler like "that was so cool" or "great episode" with nothing behind it; give a real, concrete take grounded in what just played.

Hard rules:
- You know this show ONLY up to the viewer's current episode and current moment: the synopsis, the cast you have been told about, and the subtitle lines marked as already shown. Treat everything past that as unknown to you, even later episodes you might know from elsewhere.
- Never reveal, hint at, or foreshadow anything that has not happened yet on screen, even if you could guess it from genre or synopsis. If they ask what happens next, dodge it like a friend who refuses to spoil: tease, change the subject, tell them to keep watching.
- Stay about this anime and this moment. Do not invent plot, lines, or character details the show has not shown. If you are not sure, say you are not sure rather than make something up.`;

const TONE_PROMPTS: Record<string, string> = {
  adaptive:
    'Read the viewer and match them: their energy, their length, their humour. Hyped when they are hyped, gentle when they are quiet.',
  analytical:
    'Lean thoughtful. Notice themes, character beats, direction, and payoffs that have already landed. Be the friend who studies film but is still easy to talk to, not a textbook.',
  hype: 'Be loud and fun. Crack jokes, react big, hype the cool moments. Keep it light and playful.',
  melancholic:
    'Be soft and a little wistful. Sit in the feelings with them. Gentle, tender, unhurried.',
  unhinged:
    'Drop the filter. Be crude, blunt, sweary, and chaotic, like a friend with zero brain-to-mouth filter. Crass humour is welcome. Still never spoil what has not aired.',
};

interface Seed {
  title?: string;
  synopsis?: string;
  genres?: string[];
  format?: string;
}
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
interface RosterEntry {
  name?: string;
  role?: string;
  va?: string;
}
interface CompanionBody {
  seed?: Seed;
  tone?: string;
  mature?: boolean;
  episode?: number;
  total?: number;
  window?: string[];
  roster?: RosterEntry[];
  messages?: ChatMessage[];
  message?: string;
}

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

const buildSystem = (body: CompanionBody): string => {
  const seed = body.seed || {};
  const title = seed.title?.trim() || 'this anime';
  const format = seed.format ? ` (${seed.format})` : '';
  const epTotal = body.total ? ` of ${body.total}` : '';
  const ep = body.episode ? `, episode ${body.episode}${epTotal}` : '';

  const knownUpTo = body.episode
    ? ` You know ${title} only up to episode ${body.episode}; anything later has not happened for the viewer yet.`
    : '';
  const parts: string[] = [
    BASE_VOICE,
    `SHOW: ${title}${format}${ep}.${knownUpTo}`,
  ];

  if (seed.synopsis) {
    parts.push(
      `SYNOPSIS (may describe the whole series, so do not use it to reveal anything that has not aired yet): ${clip(
        seed.synopsis,
        1200
      )}`
    );
  }
  if (seed.genres?.length) parts.push(`GENRES: ${seed.genres.join(', ')}.`);

  // Cast roster: names + role + JP voice actor only, no bios. Helps the
  // companion get names right and answer "who was that?" without inventing
  // anything. Capped so a stuffed roster can't blow up the prompt.
  const roster = (body.roster || [])
    .filter((r) => r && typeof r.name === 'string' && r.name.trim())
    .slice(0, 12)
    .map((r) => {
      const role = r.role ? ` (${clip(r.role, 24)})` : '';
      const va = r.va ? `, VA: ${clip(r.va, 60)}` : '';
      return `${clip(r.name!.trim(), 60)}${role}${va}`;
    });
  if (roster.length) {
    parts.push(
      `CAST you may know up to this point (names, role, and Japanese voice actor only, no story details; do not assume anything about their arcs beyond what has aired):\n${roster.join(
        '\n'
      )}`
    );
  }

  const window = (body.window || [])
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-40);
  if (window.length) {
    parts.push(
      `ALREADY SHOWN — subtitle lines up to the viewer's current moment, oldest first. This is the edge of what you know; nothing past it has happened for them yet:\n${window.join(
        '\n'
      )}`
    );
  } else {
    parts.push(
      `SUBTITLE CONTEXT: not available for this player. You only know up to episode ${
        body.episode || '?'
      }. Do not reveal anything a viewer at this point could not have seen.`
    );
  }

  // Honour the explicit tone only when the viewer opted in; otherwise keep it fun.
  let tone = body.tone && TONE_PROMPTS[body.tone] ? body.tone : 'adaptive';
  if (tone === 'unhinged' && !body.mature) tone = 'hype';
  parts.push(`TONE: ${TONE_PROMPTS[tone]}`);

  return parts.join('\n\n');
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  // Status probe so the panel can show the right state before anyone types.
  if (req.method === 'GET') {
    res.status(200).json({ configured: Boolean(API_KEY) });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!API_KEY) {
    // Wired but no key yet — the panel renders a friendly setup note.
    res.status(503).json({ error: 'companion_unconfigured' });
    return;
  }

  const body = (req.body || {}) as CompanionBody;
  const message = (body.message || '').toString().trim();
  if (!message) {
    res.status(400).json({ error: 'empty_message' });
    return;
  }

  const history = (body.messages || [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: clip(m.content, 1500) }));

  const messages = [
    { role: 'system', content: buildSystem(body) },
    ...history,
    { role: 'user', content: clip(message, 1500) },
  ];

  try {
    const upstream = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.85,
        max_tokens: 400,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(
        '[companion] upstream',
        upstream.status,
        detail.slice(0, 300)
      );
      res
        .status(502)
        .json({ error: 'upstream_error', status: upstream.status });
      return;
    }

    const json = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = json.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) {
      res.status(502).json({ error: 'empty_reply' });
      return;
    }
    res.status(200).json({ reply });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[companion] fetch failed', err);
    res.status(502).json({ error: 'network_error' });
  }
};

export default handler;
