# Boot automation for the friend-testing stack — DONE (via Tailscale Funnel)

**Goal (met):** after a reboot, the kessoku moe custom player is testable by a friend
with **zero manual steps** and a **stable public URL** that never changes, so the Railway
var is set once and never touched again.

Implemented 2026-06-03. See `docs/SHARE-FOR-TESTING.md` for the operating runbook.

---

## What was chosen and why

The original plan offered two paths. We took the "stable URL, no domain, free" route with
**Tailscale Funnel** instead of a named Cloudflare tunnel, because it needs **no domain
purchase** and Tailscale already runs as an auto-starting Windows service.

- ~~Cloudflare named tunnel~~ — would have worked but needs a domain on Cloudflare. Skipped.
- ~~Cloudflare quick tunnel + auto-redeploy~~ — ephemeral URL, redeploy every boot. Rejected.
- **Tailscale Funnel** — stable `https://<machine>.<tailnet>.ts.net`, free, no domain,
  auto-starts on boot. Chosen.

---

## How it is wired (this laptop)

Stable URL: **`https://okashiina.taild5f30a.ts.net`** (machine `okashiina`).

| Piece | Auto-start on boot | How |
|---|---|---|
| Docker Desktop | yes | Settings -> General -> "Start Docker Desktop when you log in" (enabled). |
| `kessoku-source-service` + `kessoku-flaresolverr` | yes | compose `restart: unless-stopped`. |
| Tailscale + Funnel | yes | Tailscale installs `tailscaled` as a Windows service; `tailscale funnel --bg 8088` persists the serve-config, so the public URL resumes on boot. |
| Railway frontend | n/a | `NEXT_PUBLIC_SOURCE_SERVICE_URL = https://okashiina.taild5f30a.ts.net`, set once (URL is permanent). |

One-time setup steps that produced the above:
1. `winget install Tailscale.Tailscale`
2. `tailscale up` -> browser login (GitHub).
3. Enabled Funnel + HTTPS in the Tailscale admin console (one click).
4. `tailscale funnel --bg 8088`.
5. Added `PUBLIC_BASE_URL=https://okashiina.taild5f30a.ts.net` to
   `services/source-service/.env` (forces https links — see the gotcha below) and rebuilt.
6. Set the Railway var + redeployed.

---

## Gotcha worth remembering: mixed content

Behind a TLS-terminating tunnel, `req.protocol` inside Fastify is plain `http`, so the
service built `http://` links for `/hls`, `/file`, `/subs`. On the https Railway frontend
the browser blocks those as mixed content and the player goes black. Fix (committed):
`server.ts` now prefers `config.publicBaseUrl` (env `PUBLIC_BASE_URL`), then
`X-Forwarded-Proto`, then `req.protocol`. Set `PUBLIC_BASE_URL` to the public https origin.

---

## Remaining caveats / when to revisit

- **Laptop must be on**, and Tailscale Funnel is fair-use / low-volume; this is for one or
  two testers, not real traffic.
- **Endgame is the VPS** (`docs/STREAMING-ROADMAP.md`): same source-service on a VPS with a
  residential proxy, where this whole laptop-host arrangement (and its bandwidth/uptime
  burden) goes away. When that lands, drop the laptop Funnel and point the Railway var at
  the VPS instead.
- If the machine name or tailnet ever changes, update `PUBLIC_BASE_URL` in `.env` + the
  Railway var (both reference the same URL).
