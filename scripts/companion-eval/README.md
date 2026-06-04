# Companion eval

How we iterate the AI watch companion. The companion runs on a hosted model we
cannot fine-tune, so "training" here means **prompt + grounding iteration**: you
change the system prompt and the grounding in
[`frontend/pages/api/companion.ts`](../../frontend/pages/api/companion.ts), then
re-run this harness and read how the behaviour moved. Keep iterating until the
scores hold.

The harness replays scripted multi-turn conversations against a running
`/api/companion`. The anime, cast, and "aired subtitle window" in
[`fixtures.json`](./fixtures.json) are **fake on purpose**: a real model has no
memory of these invented titles, so any concrete detail it states that is not in
the supplied window or cast is a measurable spoiler or hallucination — exactly
what we want to catch.

## What it checks

Each reply is scored 1-5 on:

- **spoilerSafety** — did it avoid revealing or hinting at anything past the
  aired window (including "what happens next" bait)?
- **groundedness** — are its claims tied to the window/cast, not invented?
- **toneAdherence** — does it match the selected tone (hype / analytical /
  melancholic / adaptive / unhinged)?
- **specificity** — concrete about the actual moment (named characters, real
  lines) instead of generic praise?
- **coherence** — natural, on-topic, in the viewer's language?

## Run it

1. Start the app with a companion key so replies are real (not the setup stub):

   ```bash
   # in frontend/, with COMPANION_API_KEY set (free Google AI Studio key works)
   COMPANION_API_KEY=... yarn dev
   ```

2. Run the harness (Node 18+, no install needed):

   ```bash
   node scripts/companion-eval/eval.mjs
   ```

   Without a judge key it just prints the transcripts so you can read them.

3. To also score the replies, set an OpenAI-compatible judge:

   ```bash
   COMPANION_JUDGE_KEY=sk-... \
   COMPANION_JUDGE_BASE=https://api.openai.com/v1 \
   COMPANION_JUDGE_MODEL=gpt-4o-mini \
   node scripts/companion-eval/eval.mjs
   ```

## Env vars

| Var | Default | What it does |
| --- | --- | --- |
| `COMPANION_BASE` | `http://localhost:3000` | Where the app is running. |
| `COMPANION_JUDGE_KEY` | _(unset)_ | Set to enable the LLM judge + scorecard. |
| `COMPANION_JUDGE_BASE` | `https://api.openai.com/v1` | Any OpenAI-compatible base. |
| `COMPANION_JUDGE_MODEL` | `gpt-4o-mini` | Judge model. |

> The endpoint can also be overridden per-fixture via the top-level `endpoint`
> field in `fixtures.json`.

## Adding cases

Add a conversation to `fixtures.json` with a `seed` (title / synopsis / genres /
format / roster), an `episode` + `total`, a `window` of subtitle lines aired so
far, a `tone`, and the `turns` the viewer types. Put at least one "what happens
next?" bait turn in each so spoiler-safety actually gets exercised, and vary the
language (English / Indonesian) to test mirroring.

This harness only sends HTTP. It never starts the app and never commits.
