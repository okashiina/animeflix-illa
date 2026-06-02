# animeflix source-service (Option B)

Self-hosted anime source resolver: **multi-provider scraper → HLS proxy → (later)
subtitles**, the same shape Miruro uses. It is deployed **separately on a VPS**
(see [`../../docs/VPS-SETUP.md`](../../docs/VPS-SETUP.md)) — it is intentionally
outside the `frontend`/`packages` workspaces so it never touches the Railway build.

Plan, phases and the anti-fragility SOP live in
[`../../docs/STREAMING-ROADMAP.md`](../../docs/STREAMING-ROADMAP.md).

## What works now (skeleton)

- Fastify server with `/health`, `/status`, `/watch`, `/hls`, `/subs`.
- Resolver with **provider fallback chain + circuit breaker + cache** (SOP #1/#3/#6).
- **HLS proxy** that rewrites playlists/segments and injects Referer/Origin.
- **FlareSolverr** wired in (`fetcher.ts`, `solver: true`) for Cloudflare hosts.
- **Embed fallback**: `/watch` returns `{ mode: 'embed' }` when no provider yields a
  source, so the frontend keeps using its embed switcher (SOP #2). The site never
  goes dark.
- Providers (`allanime`, `animepahe`) are **stubs** — real extractors land in Phase 1.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:8080
npm run typecheck    # tsc --noEmit
```
FlareSolverr isn't required to boot; providers needing it just fail soft until you
run the full Docker stack.

## Run the full stack (VPS / Docker)

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:8080/health     # {"ok":true}
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness |
| `GET /status` | uptime, provider list, circuit-breaker state |
| `GET /watch?anilistId=&episode=&category=sub\|dub&titles=` | resolve → `{mode:'direct',sources,subtitles}` or `{mode:'embed'}` |
| `GET /hls?url=&ref=` | HLS playlist/segment proxy |
| `GET /subs` | subtitles (Phase 3, not implemented) |

## Frontend wiring (Phase 1)

The Next.js watch page calls `/watch` first; on `mode:'direct'` it feeds the sources
to the player (vidstack/artplayer); on `mode:'embed'` it renders the existing
`EmbedPlayer`. Set `NEXT_PUBLIC_SOURCE_SERVICE_URL` to this service's public URL.

## Next (Phase 1)

1. Implement `providers/allanime.ts` (use `/playwright-cli` + `/web-scraping`; test
   live; route through FlareSolverr).
2. Add a canary (`/status` already exposes breaker state) + Discord/Telegram alert.
3. Wire the frontend `mode:'direct'` path + player.
