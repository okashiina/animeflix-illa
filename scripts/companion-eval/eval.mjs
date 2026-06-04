#!/usr/bin/env node
// Companion eval harness — dependency-free Node ESM (global fetch, Node 18+).
//
// This is how we "train" the watch companion. We cannot fine-tune the hosted
// model, so iteration means tightening the SYSTEM PROMPT and the GROUNDING in
// frontend/pages/api/companion.ts and re-running this. It replays scripted
// multi-turn conversations (scripts/companion-eval/fixtures.json) against a
// running /api/companion, where the anime + cast + "aired subtitle window" are
// FAKE on purpose: a real model has no memory of these titles, so any detail it
// states past the supplied window is a measurable spoiler/hallucination.
//
// Run it:
//   1. Start the app with a companion key:
//        COMPANION_API_KEY=... yarn dev   (or set COMPANION_API_KEY in .env)
//   2. node scripts/companion-eval/eval.mjs
//
// Without a judge key it prints the transcripts so you can read them.
// With a judge key it also scores each reply and prints a scorecard:
//   COMPANION_JUDGE_KEY=sk-...                      (required to judge)
//   COMPANION_JUDGE_BASE=https://api.openai.com/v1  (any OpenAI-compatible base)
//   COMPANION_JUDGE_MODEL=gpt-4o-mini               (judge model)
//   COMPANION_BASE=http://localhost:3000            (where the app runs)
//
// It never starts the app and never commits anything; it only sends HTTP.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const APP_BASE = (process.env.COMPANION_BASE || 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const JUDGE_KEY = process.env.COMPANION_JUDGE_KEY || '';
const JUDGE_BASE = (
  process.env.COMPANION_JUDGE_BASE || 'https://api.openai.com/v1'
).replace(/\/$/, '');
const JUDGE_MODEL = process.env.COMPANION_JUDGE_MODEL || 'gpt-4o-mini';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const SCORE_KEYS = [
  'spoilerSafety',
  'groundedness',
  'toneAdherence',
  'specificity',
  'coherence',
];

const loadFixtures = async () => {
  const raw = await readFile(resolve(HERE, 'fixtures.json'), 'utf8');
  return JSON.parse(raw);
};

// Drive one conversation: send each user turn with the running history, collect
// the assistant replies. Mirrors what CompanionChat posts from the browser.
const runConversation = async (endpoint, convo) => {
  const messages = [];
  const exchanges = [];

  for (let i = 0; i < convo.turns.length; i += 1) {
    const message = convo.turns[i];
    const body = {
      seed: convo.seed,
      episode: convo.episode,
      total: convo.total,
      tone: convo.tone,
      mature: Boolean(convo.mature),
      window: convo.window || [],
      roster: (convo.seed && convo.seed.roster) || [],
      messages: messages.slice(-10),
      message,
    };

    let reply = '';
    let status = 0;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      status = res.status;
      if (res.ok) {
        const json = await res.json();
        reply = (json && json.reply) || '';
      } else {
        const detail = await res.text().catch(() => '');
        reply = `[no reply — HTTP ${status}] ${detail.slice(0, 160)}`;
      }
    } catch (err) {
      reply = `[request failed] ${err && err.message ? err.message : err}`;
    }

    messages.push({ role: 'user', content: message });
    if (status >= 200 && status < 300 && reply) {
      messages.push({ role: 'assistant', content: reply });
    }
    exchanges.push({ user: message, reply, status });
  }

  return exchanges;
};

// LLM judge. Returns { scores, notes } or null on failure. Scores are 1-5.
const judge = async (convo, exchanges) => {
  const transcript = exchanges
    .map((x, i) => `Turn ${i + 1}\nViewer: ${x.user}\nCompanion: ${x.reply}`)
    .join('\n\n');

  const context = [
    `Anime: ${convo.seed.title}`,
    `Synopsis (full series — may describe things past the viewer's point): ${convo.seed.synopsis}`,
    `Viewer is on episode ${convo.episode} of ${convo.total}.`,
    `Cast the companion was told about: ${(convo.seed.roster || [])
      .map((r) => r.name)
      .join(', ')}`,
    `Selected tone: ${convo.tone}`,
    `Subtitle lines aired so far (this is the EDGE of what the companion may know):\n${(
      convo.window || []
    ).join('\n')}`,
  ].join('\n');

  const system = `You are a strict evaluator for an anime "watch companion" chatbot. The companion must behave like a friend watching alongside the viewer who only knows the show up to the aired subtitle lines provided. Score each dimension 1-5 (5 = excellent) for the whole conversation:
- spoilerSafety: did it avoid revealing or hinting at ANYTHING past the aired window? A confident detail not in the window/cast is a spoiler or hallucination → low score.
- groundedness: are its claims tied to the provided window/cast, not invented?
- toneAdherence: does it match the selected tone?
- specificity: is it concrete about the actual moment (named characters, real lines) vs generic praise?
- coherence: does it read as a natural, on-topic reply in the viewer's language?
Respond ONLY with minified JSON: {"spoilerSafety":n,"groundedness":n,"toneAdherence":n,"specificity":n,"coherence":n,"notes":"one sentence"}.`;

  const user = `CONTEXT\n${context}\n\nTRANSCRIPT\n${transcript}`;

  try {
    const res = await fetch(`${JUDGE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JUDGE_KEY}`,
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { error: `judge HTTP ${res.status}: ${detail.slice(0, 160)}` };
    }
    const json = await res.json();
    const content =
      json && json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content
        : '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { error: `judge returned no JSON: ${content.slice(0, 120)}` };
    const parsed = JSON.parse(match[0]);
    const scores = {};
    SCORE_KEYS.forEach((k) => {
      const n = Number(parsed[k]);
      scores[k] = Number.isFinite(n) ? n : 0;
    });
    return { scores, notes: parsed.notes || '' };
  } catch (err) {
    return { error: `judge failed: ${err && err.message ? err.message : err}` };
  }
};

const colorForScore = (n) => {
  if (n >= 4) return GREEN;
  if (n >= 3) return YELLOW;
  return RED;
};

const printTranscript = (convo, exchanges) => {
  process.stdout.write(
    `\n${BOLD}${CYAN}# ${convo.id}${RESET} ${DIM}(tone: ${convo.tone}, ep ${convo.episode}/${convo.total})${RESET}\n`
  );
  exchanges.forEach((x) => {
    process.stdout.write(`  ${BOLD}Viewer:${RESET} ${x.user}\n`);
    process.stdout.write(`  ${BOLD}Companion:${RESET} ${x.reply}\n\n`);
  });
};

const main = async () => {
  const fixtures = await loadFixtures();
  const endpoint = fixtures.endpoint || `${APP_BASE}/api/companion`;
  const judging = Boolean(JUDGE_KEY);

  process.stdout.write(
    `${BOLD}Companion eval${RESET} → ${endpoint}\n${DIM}${
      judging
        ? `judge: ${JUDGE_MODEL} via ${JUDGE_BASE}`
        : 'no COMPANION_JUDGE_KEY set — printing transcripts only'
    }${RESET}\n`
  );

  // Fail fast with a clear hint if the app/endpoint is not reachable.
  try {
    const probe = await fetch(endpoint, { method: 'GET' });
    const info = await probe.json().catch(() => ({}));
    if (!info.configured) {
      process.stdout.write(
        `${YELLOW}warning:${RESET} /api/companion reports configured=false. Set COMPANION_API_KEY in the app env, or replies will be the setup stub.\n`
      );
    }
  } catch {
    process.stdout.write(
      `${RED}error:${RESET} could not reach ${endpoint}. Start the app first (e.g. \`yarn dev\`) and/or set COMPANION_BASE.\n`
    );
    process.exitCode = 1;
    return;
  }

  const scorecard = [];

  for (let i = 0; i < fixtures.conversations.length; i += 1) {
    const convo = fixtures.conversations[i];
    // eslint-disable-next-line no-await-in-loop
    const exchanges = await runConversation(endpoint, convo);
    printTranscript(convo, exchanges);

    if (judging) {
      // eslint-disable-next-line no-await-in-loop
      const result = await judge(convo, exchanges);
      if (result.error) {
        process.stdout.write(`  ${RED}judge: ${result.error}${RESET}\n`);
      } else {
        const line = SCORE_KEYS.map(
          (k) => `${k} ${colorForScore(result.scores[k])}${result.scores[k]}${RESET}`
        ).join('  ');
        process.stdout.write(`  ${DIM}${result.notes}${RESET}\n  ${line}\n`);
        scorecard.push({ id: convo.id, scores: result.scores });
      }
    }
  }

  if (judging && scorecard.length) {
    process.stdout.write(`\n${BOLD}Scorecard (1-5)${RESET}\n`);
    const header = ['conversation'.padEnd(32)].concat(
      SCORE_KEYS.map((k) => k.slice(0, 8).padStart(9))
    );
    process.stdout.write(`${DIM}${header.join(' ')}${RESET}\n`);

    const totals = {};
    SCORE_KEYS.forEach((k) => {
      totals[k] = 0;
    });

    scorecard.forEach((row) => {
      const cells = [row.id.padEnd(32)].concat(
        SCORE_KEYS.map((k) => {
          totals[k] += row.scores[k];
          return `${colorForScore(row.scores[k])}${String(row.scores[k]).padStart(
            9
          )}${RESET}`;
        })
      );
      process.stdout.write(`${cells.join(' ')}\n`);
    });

    const avgCells = ['AVG'.padEnd(32)].concat(
      SCORE_KEYS.map((k) => {
        const avg = totals[k] / scorecard.length;
        return `${colorForScore(avg)}${avg.toFixed(1).padStart(9)}${RESET}`;
      })
    );
    process.stdout.write(`${BOLD}${avgCells.join(' ')}${RESET}\n`);
  }
};

main().catch((err) => {
  process.stderr.write(`${RED}eval crashed:${RESET} ${err && err.stack ? err.stack : err}\n`);
  process.exitCode = 1;
});
