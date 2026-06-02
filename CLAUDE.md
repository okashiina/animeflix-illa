# CLAUDE.md — project guidance for animeflix (okashiina/animeflix-illa fork)

These instructions are mandatory. Follow them every session.

## 1. Always refer to the streaming roadmap
Before doing ANY work on the video/streaming pipeline (sources, providers, player,
proxy, subtitles, hosting), READ and follow **[docs/STREAMING-ROADMAP.md](docs/STREAMING-ROADMAP.md)**.
Keep that file updated when phases progress or decisions change — it is the source
of truth for the self-hosted (Option B) plan and its anti-fragility SOP.

## 2. Mandatory skills by context
Invoke these skills (Skill tool) before/while doing the matching work — not optional:

- **UI / UX work** (any redesign, rework, restyle, new component/page, layout,
  visual polish): ALWAYS use `/impeccable`, `/ui-ux-pro-max`, and `/frontend-design`.
  Add `/taste-skill` or `/soft-skill` for visual-taste passes.
- **Scraping / anti-bot / browser automation** (Option B source-service, provider
  extractors, Cloudflare/DDoS-Guard work): use `/playwright-cli` and `/web-scraping`.

## 3. Working style (from user feedback)
- **Verify before claiming done.** Run `tsc`/`eslint`/build and check actual config
  before saying something works. When you genuinely can't verify (e.g. a third-party
  embed iframe playing in a real browser), say so explicitly — state what you did
  verify vs. what still needs the user's check. Don't imply it's confirmed.

## 4. Project context (quick orientation)
- Next.js + Turborepo monorepo (`frontend`, `packages/*`). Deploys on Railway
  project "anime-happy" (GitHub-connected, watch paths cleared, Dockerfile build).
- The old GogoAnime source is permanently dead. Video currently uses a **third-party
  embed-iframe switcher** ([frontend/utility/embedProviders.ts](frontend/utility/embedProviders.ts) +
  `EmbedPlayer.tsx`) — this stays as the automatic fallback even after Option B.
- Long-term direction: self-host the video pipeline + redesign the UI in-repo
  (see the roadmap). Willing to move the source-service off Railway to a VPS.
