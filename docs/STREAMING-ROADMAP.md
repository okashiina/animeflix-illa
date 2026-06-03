# Animeflix — Self-Hosted Streaming Roadmap (Option B)

Goal: own the video pipeline (own player UI, quality control, Indonesian subtitles)
like Miruro does, **without** inheriting its "heavy & fragile" failure modes.

This is a living plan. Phase 0 (embed switcher) is already shipped as the safety net.

---

## 1. What we learned from Miruro (verified via Playwright network probe)

- Miruro runs its **own backend** (`/api/secure/pipe`) that scrapes **multiple
  providers** server-side — confirmed payloads referenced `animepahe:…` (provider
  "kiwi") and `allmanga:…` / AllAnime (provider "ally").
- It **proxies the HLS** (`*.ultracloud.cc/…/pl.m3u8`) through its own domain to
  beat CORS/Referer, and plays it in its **own player** (hence quality + subs).
- API responses are **encrypted** (ECDH key from `/api/secure/jwks`) to stop reuse.
- **The catch (verified):** even the "lighter" sources are anti-bot gated —
  AllAnime returned `403 Just a moment…` (Cloudflare) from our IP; AnimePahe uses
  DDoS-Guard. Miruro beats this with heavy infra (Cloudflare solving + proxies).
  **From a Railway datacenter IP this is worse, not better.**

Conclusion: Option B is viable but it is an *operations* problem, not a code
problem. The SOP below exists to keep it from becoming the thing that breaks.

---

## 2. Target architecture

```
[ Next.js frontend + own player (vidstack/artplayer/OSS module) ]
                 │  GET /api/watch?anilistId=&ep=&category=
                 ▼
[ source-service ]  (separate Node service, NOT on a datacenter IP)
   ├─ resolver: provider fallback chain (priority-ordered)
   │     1. AllAnime   2. AnimePahe   3. HiAnime  4. … 
   ├─ anti-bot layer:  FlareSolverr / Playwright pool / residential proxy
   ├─ cache:           (anilistId,ep,provider) -> sources  [short TTL]
   └─ returns:         { sources:[{url,quality}], subtitles:[{lang,url}], headers }
                 │
                 ▼
[ /api/hls-proxy ]  rewrites playlist + segment URLs, injects Referer/Origin
                 │
                 ▼
[ /api/subs ]  OpenSubtitles (id) -> .srt -> .vtt  (Indo subtitles, our domain)
```

Key point: **the embed-iframe switcher (Phase 0) stays as the automatic last
resort.** If the whole self-hosted path fails, the player falls back to embeds so
the site never goes fully dark.

---

## 3. STRICT SOP — mitigating "heavy & fragile"

These are non-negotiable rules. Each maps to a concrete failure we expect.

1. **Provider abstraction + fallback chain.** Every source lives behind one
   interface (`search / episodes / sources`). The resolver tries providers in
   priority order; first playable source wins. **Never** ship a single-provider path.
2. **Embed fallback is mandatory.** If all self-hosted providers fail for a title,
   the API returns `{mode:"embed"}` and the player loads the Phase-0 iframe. The
   site degrades, never dies.
3. **Circuit breaker per provider.** N failures in a window → mark provider "open"
   (skip) for a cooldown, auto half-open retry. One dead source never slows every
   request.
4. **Canary monitoring + alerts.** A cron canary every 5–10 min resolves a known
   popular title on each provider, asserts a valid m3u8 + first segment loads, and
   posts per-provider up/down to a `/status` page + a Discord/Telegram webhook.
   You learn a provider broke **before** users do.
5. **Contract tests vs. live sites (nightly CI).** Each provider's parser has a
   test hitting the real site. When their HTML/encryption changes and the test
   fails, CI alerts. This is what turns "fragile" into "monitored".
6. **Caching everywhere.** Cache resolved sources (10–30 min TTL) and subtitles
   (long TTL). Cuts latency, load, and anti-bot exposure.
7. **Config-as-data.** Provider base URLs, proxy creds, keys, priorities all in
   env/DB — swap a dead provider domain or proxy **without a redeploy**.
8. **Anti-bot with backoff.** FlareSolverr/proxy pool with bounded retries +
   exponential backoff; never hammer (that gets the IP banned faster).
9. **Observability.** Structured logs + per-provider success-rate/latency metrics +
   an error taxonomy (network / challenge / parse / no-source).
10. **Staged rollout via feature flag.** Default = embed. Flip self-host **per
    provider** only after its canary is green for X days. Reversible instantly.
11. **Low profile / legal posture.** Rate-limit, no public hotlinking, keep it
    personal-scale, be DMCA-ready (this is the reality that killed gogoanime).

---

## 4. Hosting (off Railway)

Railway datacenter IPs are heavily challenged. Options, cheapest→most robust:
- **A small VPS** (Hetzner/Contabo/etc.) running source-service + FlareSolverr.
  Some provider challenges pass from a clean VPS IP; cheap to start.
- **+ Residential/ISP rotating proxy** (paid, e.g. per-GB) for the providers that
  still challenge a VPS IP. This is the real unlock and the main recurring cost.
- Frontend (Next.js) can stay anywhere (Vercel/Railway); only the source-service
  needs the special egress.

---

## 5. Phases & decision gates

- **Phase 0 — DONE.** Embed switcher live = safety net.
- **Phase 1 — WIRED & PLAYING (2026-06-03).** End-to-end playback confirmed in a
  real browser: **FlareSolverr (Docker) + AnimePahe** → kwik → m3u8 → `/hls` proxy
  (injects `Referer: https://kwik.cx/`) → **hls.js** on the watch page (`mode:'direct'`),
  embed switcher kept as the bidirectional fallback. One gotcha solved: AnimePahe/kwik
  mis-signals AAC-LC audio as **AAC-Main (`mp4a.40.1`)**, which Chrome can't
  `addSourceBuffer`; a tiny MSE shim remaps it to `mp4a.40.2` so it decodes. Player UX
  polish is the next round — see **§8**.
- **Phase 2 — Resilience.** Add 2–3 fallback providers + caching + circuit breakers
  + canary monitoring + `/status`. Gate: canary >95% green for a week.
  **Provider decision (2026-06-03 — see [STREAMING-SOURCES-RESEARCH.md](STREAMING-SOURCES-RESEARCH.md)):**
  a March 2026 Crunchyroll DMCA wave froze `aniwatch`/`consumet` upstream (the npm
  packages still install). **HiAnime/Zoro via `aniwatch` is the only true soft-sub
  source** (returns separate multi-language WebVTT) → implement as
  `providers/hianime.ts`, but its page hosts are ISP-blocked from the laptop
  (522 / SNI hang), so extraction is **VPS-gated**. **AllAnime** (ani-cli
  AES-256-CTR method, actively patched) is the healthiest surviving extractor but
  **hardsub** — use for coverage/fallback, not subtitle styling. AnimePahe stays the
  always-on hardsub baseline.
- **Phase 3 — Subtitles.** Plan revised by research (2026-06-03 — see
  [SUBTITLE-SOURCING-RESEARCH.md](SUBTITLE-SOURCING-RESEARCH.md)): **English is free**
  (the soft-sub stream bundles an English VTT — don't build a pipeline for it).
  **Japanese → Jimaku** (AniList-native API). **Indonesian → subdl** best-effort
  (`id` catalogue, IMDb-keyed, partial anime coverage). Convert ASS/SRT → VTT
  server-side and cache. Honest verdict: broad Indonesian coverage is not attainable
  from a clean source (Indo subs are mostly hardsubs); full coverage only via
  server-side machine translation. **Free API keys to obtain: Jimaku + subdl.**
  OpenSubtitles deprioritized (IMDb-mapping pain + ~20 downloads/day cap).
- **Phase 4 — UI redesign** (now prioritized FIRST — free, high-value, no source
  dependency). Rebuild watch/home/browse UI in-repo on the existing embed playback,
  using the mandatory UI/UX skills (CLAUDE.md). Player lib decided here.

### 5a. Phase-1 PoC findings (2026-06-02) — decisive

Ran from the user's own **residential** connection (not a datacenter IP):

1. **Plain `fetch` → `api.allanime.day/api` = HTTP 403 Cloudflare "Just a moment…"
   JS challenge.** (`services/source-service/scripts/probe-allanime.mjs`.)
2. **A headed, Playwright-launched Edge stays stuck on the challenge** — Cloudflare
   detects `navigator.webdriver`/automation.
   (`scripts/poc-browser.mjs`.)
3. **Even attaching to a normally-launched Edge over CDP (no automation flags) does
   NOT clear** the managed challenge on a fresh profile.
   (`scripts/poc-browser-cdp.mjs`.)

**Conclusions:**
- The blocker is **not IP reputation** (a residential IP 403s too) — so a residential
  proxy does **not** fix AllAnime. It's a **JS/bot challenge**.
- A vanilla automated browser is **detected**. Beating it reliably needs
  **FlareSolverr-grade stealth** (undetected Chromium) running **on the same box/IP**
  to mint a `cf_clearance` cookie (IP+UA-bound, ~30 min) → realistically **~2 GB RAM**.
  That is the confirmed **"heavy" cost** (~Rp100k/mo VPS, or the user's own always-on PC).
- The **embed switcher (Phase 0) sidesteps all of this for free** because it runs
  client-side in the user's real browser (inherits its challenge-solving + IP).

**DECISION:** Park Option B until there's a 2 GB box (VPS or always-on home PC running
Docker+FlareSolverr). Do **Phase 4 (UI redesign) first** on the free embed playback.
The source-service code stays in-repo, typechecking and ready to activate. To resume
Option B later: stand up Docker + FlareSolverr, then implement
`providers/allanime.ts` using the probe scripts above as the reference flow
(search → episode → decode `sourceUrl` via XOR-56 → `clock.json` → m3u8/mp4).

---

## 6. Inputs (answered)

- **Player base = this very project** (the fork). The UI redesign happens in-repo on
  the existing Next.js frontend; there is no external player to import. Player lib for
  the rebuilt watch view: **Vidstack (`@vidstack/react`) + `hls.js`** — DECIDED. It is
  React-native (our stack), HLS-capable, has built-in skip-markers/PiP/keyboard/speed/
  theater, and is what the best-reviewed competitor (Miruro) ships. See the field
  survey + gap analysis in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md). UI
  redesign work must use the mandatory UI/UX skills (see CLAUDE.md).
- **Budget:** start with a ~$5–6/mo VPS (FlareSolverr fits in 2 GB RAM). Add a
  residential/ISP proxy only if a clean VPS IP still gets challenged — usage-based,
  roughly $2–10/mo for personal scale (route only the provider API/challenge through
  it; serve video segments direct). User confirms once real costs are quoted.
- **Subtitles:** English + Indonesian are the priority; other languages optional
  long-run.

---

## 7. Skills to assist the build (from /find-skills)

- `microsoft/playwright-cli` (46.6K) — browser automation for the anti-bot layer.
- `mindrally/skills@web-scraping` (3K) — scraping patterns.
- `wshobson/agents@nextjs-app-router-patterns` (19.6K) — Next.js patterns.
- Player lib (direct dep, not a skill): **vidstack** or **artplayer** + `hls.js`.

---

## 8. Requested feature backlog (player UX + data) — from user, 2026-06-03

Phase 1 plays end-to-end now. The next rounds, in user-priority order:

**Player UX (in progress).** Replace the plain native `<video controls>` with our own
control bar — own-brand SVG icons, **no new dependency** (the repo already ships
`@vime`, `hls.js`, `@heroicons`, `framer-motion`; we hand-roll icons for a bespoke
look and to avoid lockfile churn while another session edits the home page). Scope:
configurable **skip ±5/10/15s**, **PiP**, **fullscreen**, **playback speed**, volume,
scrubber with buffered range, a **settings** menu, **keyboard hotkeys**, and a
**captions toggle** scaffold (real tracks arrive in Phase 3). Quality select + the
bidirectional embed fallback stay.

**Backlog (next phases):**
1. **Watch history** — track last-watched episode + resume timestamp ("continue
   watching"). Build on the existing `Anime{id}="{ep}-{sec}"` localStorage record
   (already written in `watch/[id].tsx`).
2. **Hotkey `n` → next episode** (folded into the player keyboard now).
3. **Skip-intro** — needs intro/outro markers (aniskip API, keyed by MAL id).
4. **Indonesian subtitles** — Phase 3. Research (2026-06-03,
   [SUBTITLE-SOURCING-RESEARCH.md](SUBTITLE-SOURCING-RESEARCH.md)) revised the source:
   **subdl** (not OpenSubtitles) is the Indo pick; English is free from the soft-sub
   stream; Jimaku for Japanese. Honest verdict: broad Indo coverage isn't attainable
   cleanly (Indo subs are mostly hardsubs) — partial via subdl, full only via
   server-side MT. Needs a free subdl API key. Player is already subtitle-ready.
5. **Dubbed via our player** — likely broken; investigate AnimePahe dub (`category=dub`).
6. **/api-finder filler vs canon — DONE (2026-06-03).** `packages/api/src/filler.ts`
   scrapes animefillerlist.com → `getFillerEpisodes(title)`; a `/api/filler` route
   feeds the watch-page episode grid, which now shows colour bars (filler = amber,
   mixed = violet, anime-canon = sky; canon unmarked) with a legend that appears only
   when a title has non-canon episodes. Live-verified (Naruto 90 filler; JJK all canon).
7. **Related-anime grouping — DONE (2026-06-03).** `relations` added to the animePage
   query; a new `RelatedSection` rail on the detail page surfaces watchable franchise
   entries (sequel/prequel/side-story/OVA/spin-off, ANIME nodes only), labelled,
   de-duped and ordered. Manga/source relations dropped.
8. **Multi-source fallback** — AnimePahe lags new/airing titles (JJK S3/Culling Game
   not found); research + scrape more providers for a real fallback chain (Phase 2
   resilience SOP §3 circuit breaker + §1 provider chain). **Research outcome
   (2026-06-03, [STREAMING-SOURCES-RESEARCH.md](STREAMING-SOURCES-RESEARCH.md)):**
   the soft-sub goal points at **HiAnime via `aniwatch`** (only source with separate
   VTT tracks) — VPS-gated (laptop page hosts blocked). **AllAnime** stays the
   coverage/fallback pick but is hardsub, and its old XOR-56 decode is now outdated —
   the current method is **AES-256-CTR** (ani-cli, patched 2026-04). DMCA caveat:
   `aniwatch`/`consumet` upstream repos are frozen, so vendor/pin and be ready to
   patch the megacloud extractor in-house.

---

## 9. Local host runbook (laptop) + VPS migration off-ramp

The Option B stack runs via Docker Compose in `services/source-service/`
(`docker compose up -d --build`): `kessoku-flaresolverr` + `kessoku-source-service`,
published on **:8088** (host :8080 is the user's Apache). Both use
`restart: unless-stopped`, so they auto-start on boot / Docker launch and survive
laptop sleep — that is what stops the service dying on idle. Requirements: Docker
Desktop running, **WARP OFF** (it changes the egress IP and breaks DDoS-Guard). The
frontend reaches it via `NEXT_PUBLIC_SOURCE_SERVICE_URL=http://localhost:8088`
(gitignored `.env.local`); unset that (e.g. production) and the player stays embed-only.

**Moving to a VPS later — turn OFF the laptop auto-start** (so the two don't run in
parallel):
1. Laptop, from `services/source-service/`: `docker compose down` (stops + removes the
   containers; removed containers are not revived by `unless-stopped` on reboot).
2. Optional: disable Docker Desktop "Start when you log in" if you don't want Docker
   booting at all.
3. VPS: run the same `docker compose up -d --build` (there `unless-stopped` is correct,
   always-on).
4. Repoint the frontend `NEXT_PUBLIC_SOURCE_SERVICE_URL` from `localhost:8088` to the
   VPS URL.
