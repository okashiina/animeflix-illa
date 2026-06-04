# Share kessoku moe for testing (laptop source-service + Tailscale Funnel)

How to let a friend test the **custom player** (AnimePahe / AllAnime via our own
source-service), not just the embed-iframe fallback. The catch: the player's video
sources are resolved by `services/source-service`, which has to run somewhere with a
clean residential IP. Railway can't host it (datacenter IP gets blocked by the
scrape targets), so it runs on **your laptop** and is exposed to the internet through
**Tailscale Funnel** at a **stable URL that never changes**.

```
friend's browser  ->  Railway frontend  ->  Tailscale Funnel  ->  your laptop :8088
                      (kessoku moe UI)       (stable https URL)    (source-service + FlareSolverr)
```

The frontend on Railway is the same for everyone. It only routes to our player when
`NEXT_PUBLIC_SOURCE_SERVICE_URL` points at a reachable source-service. If the laptop
or tunnel is down, the site silently falls back to the embed player, so nothing breaks.

**Stable public URL (this machine):** `https://okashiina.taild5f30a.ts.net`
(machine `okashiina`, tailnet `taild5f30a.ts.net` — set once on Railway, never changes.)

---

## What auto-starts on boot (zero-touch)

Once set up (already done on this laptop), a reboot brings the whole chain back with
no manual steps:

1. **Docker Desktop** starts on login (Settings -> General -> "Start Docker Desktop
   when you log in" is enabled).
2. **The containers** (`kessoku-source-service` + `kessoku-flaresolverr`) auto-start
   via compose `restart: unless-stopped`.
3. **Tailscale + Funnel** run as a Windows service with the funnel serve-config
   persisted, so `https://okashiina.taild5f30a.ts.net` comes back on its own.

So normally you do nothing. The sections below are only for first-time setup or if
something is off.

---

## Two settings that must stay in place

- **Railway var** (set once, permanent): `NEXT_PUBLIC_SOURCE_SERVICE_URL =
  https://okashiina.taild5f30a.ts.net`. It is build-time baked, so changing it needs a
  frontend redeploy — but the URL is stable, so you never change it again.
- **`services/source-service/.env`** must contain
  `PUBLIC_BASE_URL=https://okashiina.taild5f30a.ts.net`. Without it the service builds
  `http://` links for `/hls`, `/file`, `/subs`, which an https frontend blocks as mixed
  content and the player goes black. (`.env` is gitignored; this is local only.)

---

## Manual bring-up (only if the chain is down)

```powershell
# 1. source-service (auto-starts with Docker, but to be sure / after code changes):
docker compose -f services/source-service/docker-compose.yml up -d --build
curl http://localhost:8088/health        # -> {"ok":true}

# 2. Tailscale Funnel (should already be on; check first):
& "C:\Program Files\Tailscale\tailscale.exe" funnel status
#   if not "Funnel on", start it:
& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 8088
```

Verify end to end through the public URL (this is the real path the friend uses):

```powershell
curl https://okashiina.taild5f30a.ts.net/health
# resolve a real episode — sources + subs should come back as https links:
curl "https://okashiina.taild5f30a.ts.net/watch?anilistId=154587&episode=1&titles=Sousou%20no%20Frieren,Frieren"
```

If the `sources[].url` come back as `https://okashiina.taild5f30a.ts.net/hls?...`,
the friend can play it. If they are `http://`, `PUBLIC_BASE_URL` is missing from `.env`
(rebuild after adding it).

Then give your friend your **Railway domain** (not the tunnel URL). On a watch page
pick **Server: AnimePahe** (or AllAnime) and the video plays through our player.

---

## Caveats (read these)

- **You can't test it from this laptop's own browser.** Because the laptop is on the
  tailnet, the funnel hostname resolves (via MagicDNS) to the private tailnet IP `100.x`,
  and Chrome blocks a public web page (Railway) from fetching a private-network address
  (Private Network Access) — the custom player silently falls back to embed and the
  cross-origin fetch shows `net::ERR_FAILED`. This is a **self-test artifact only**. To
  verify, use a device **not on your tailnet** (phone on mobile data), which resolves to
  the public Funnel IP and works. A direct top-level visit to the funnel URL still works
  from the laptop (only the cross-origin fetch is blocked). External users (your friend)
  are unaffected. If you want laptop self-testing too, the source-service can send
  `Access-Control-Allow-Private-Network: true`.
- **The laptop must stay on** (awake, Docker running). If it sleeps/shuts down, the site
  falls back to embed (safe, but no custom player / progress tracking).
- **It is your bandwidth.** Video bytes flow through your laptop's upload and Tailscale's
  relays. AllAnime is the heaviest (direct MP4, hundreds of MB per episode proxied via
  `/file`). Fine for one or two testers; Tailscale Funnel is fair-use / low-volume only.
  Real traffic = a VPS with a residential proxy (roadmap).
- **The tunnel URL is public and unauthenticated** while Funnel is on. Anyone with the
  URL can hit your source-service. Keep it to people you trust.
- **This is a testing setup, not hosting.** Long-term plan: move the source-service to a
  VPS (`docs/STREAMING-ROADMAP.md`), where Funnel/uptime/bandwidth stop being your laptop's
  problem.

---

## Take it down

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" funnel --https=443 off   # stop exposing it
docker compose -f services/source-service/docker-compose.yml down      # stop the service
```

With the tunnel off, the site just uses the embed fallback; no need to touch Railway.
