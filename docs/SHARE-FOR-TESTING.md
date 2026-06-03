# Share kessoku moe for testing (laptop source-service + Cloudflare Tunnel)

How to let a friend test the **custom player** (AnimePahe / AllAnime via our own
source-service), not just the embed-iframe fallback. The catch: the player's video
sources are resolved by `services/source-service`, which has to run somewhere with a
clean residential IP. Railway can't host it (datacenter IP gets blocked by the
scrape targets), so it runs on **your laptop** and is exposed to the internet through
a **Cloudflare Tunnel**.

```
friend's browser  ->  Railway frontend  ->  Cloudflare Tunnel  ->  your laptop :8088
                      (kessoku moe UI)       (public https URL)      (source-service + FlareSolverr)
```

The frontend on Railway is the same for everyone. It only routes to our player when
`NEXT_PUBLIC_SOURCE_SERVICE_URL` points at a reachable source-service. If the laptop
or tunnel is down, the site silently falls back to the embed player, so nothing breaks.

---

## What has to be running (3 things)

1. **Docker** (Docker Desktop). The compose stack has `restart: unless-stopped`, so the
   containers come back on their own once Docker is up.
2. **The source-service containers** (`kessoku-source-service` + `kessoku-flaresolverr`).
3. **The Cloudflare Tunnel** process pointing at `localhost:8088`.

---

## Bring it up (from a clean state)

### 1. Start the source-service

```powershell
docker compose -f services/source-service/docker-compose.yml up -d --build
```

`--build` is only needed the first time or after code changes; later just
`up -d`. Confirm it is healthy:

```powershell
docker ps                      # both kessoku-source-service and kessoku-flaresolverr "Up (healthy)"
curl http://localhost:8088/health   # -> {"ok":true}
curl http://localhost:8088/status   # -> providers ["animepahe","allanime"], breakers ok
```

### 2. Start the Cloudflare Tunnel

```powershell
C:\Users\nrkp2\cloudflared\cloudflared.exe tunnel --url http://localhost:8088
```

It prints a line like:

```
Your quick Tunnel has been created! Visit it at:
https://<random-words>.trycloudflare.com
```

Copy that URL. Leave this window open (closing it kills the tunnel).

### 3. Point the Railway frontend at the tunnel

On Railway (project **anime-happy**), frontend service -> **Variables**:

```
NEXT_PUBLIC_SOURCE_SERVICE_URL = https://<random-words>.trycloudflare.com
```

`NEXT_PUBLIC_*` is **baked at build time**, so after changing it you must
**redeploy the frontend** for the new URL to take effect.

### 4. Give your friend the URL

Send them your **Railway domain** (the kessoku moe site), not the tunnel URL.
The tunnel is internal plumbing; the friend only ever sees the normal site.

### 5. Verify end to end

Open the site, pick **Server: AnimePahe** (or AllAnime) on a watch page, and confirm
the video plays through our player with the control bar and subtitle track selector.
(Embed-only playback means the tunnel is not being reached, recheck step 3 + redeploy.)

---

## Caveats (read these)

- **Everything must stay on.** Laptop awake, Docker running, tunnel window open. If any
  drops, the site falls back to embed (safe, but no custom player / progress tracking).
- **The quick-tunnel URL is ephemeral.** Every time you restart the tunnel (reboot, closed
  window, dropped connection) the `trycloudflare.com` URL **changes**, and you have to
  redo steps 3 and 4 (update the Railway var + redeploy). For a stable URL that never
  changes, see **`docs/BOOT-AUTOMATION-BRIEF.md`** (named Cloudflare tunnel + auto-start).
- **It is your bandwidth.** Video bytes flow through your laptop's upload. AllAnime is the
  heaviest (direct MP4, hundreds of MB per episode proxied via `/file`). Fine for one or
  two testers, not for real traffic. Production = a VPS with a residential proxy (roadmap).
- **Anyone with the tunnel URL can hit your source-service.** It is a public, unauthenticated
  endpoint while open. Keep it to people you trust and take the tunnel down when you are
  done testing.
- **This is a testing setup, not hosting.** The long-term plan is in
  `docs/STREAMING-ROADMAP.md` (move the source-service to a VPS).

---

## Take it down

```powershell
# stop the tunnel: Ctrl+C in its window (or close it)
docker compose -f services/source-service/docker-compose.yml down   # stop the source-service
```

Then clear `NEXT_PUBLIC_SOURCE_SERVICE_URL` on Railway (or leave it; with the tunnel
down the site just uses the embed fallback).
