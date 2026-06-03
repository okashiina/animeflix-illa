# Brief: auto-start the friend-testing stack on every laptop boot

**Goal.** After a reboot, the kessoku moe player should be testable by a friend with
**zero manual steps**, ideally with a **stable public URL** so no Railway redeploy is
ever needed. This is a spec for Claude to implement later, not a finished setup.

Read `docs/SHARE-FOR-TESTING.md` first for the manual flow this automates.

---

## Where we are now

| Piece | Auto-starts on boot today? | Notes |
|---|---|---|
| Docker containers (`kessoku-source-service`, `kessoku-flaresolverr`) | **Almost** | `restart: unless-stopped` is set, so they come back **once Docker Desktop is running**. Docker Desktop itself must be set to start on login. |
| Cloudflare Tunnel | **No** | Started by hand (`cloudflared tunnel --url ...`). Dies when its window closes. |
| Public URL stability | **No** | Quick tunnel = a new random `trycloudflare.com` URL every start, which forces a Railway var change + redeploy each time. This is the real pain point. |

So two problems to solve: (1) the tunnel must start itself on boot, and (2) the URL
should stop changing.

---

## The decision that shapes everything: stable URL or not

### Path A (recommended) — named Cloudflare tunnel, stable hostname

A **named tunnel** has a fixed hostname (e.g. `source.<your-domain>`) that never changes,
so the Railway var is set **once and forever**. Requires a free Cloudflare account and a
**domain managed by Cloudflare** (any domain, including a cheap one or the eventual brand
domain). The brief steps, to run later:

```powershell
cloudflared tunnel login                       # browser auth, one time
cloudflared tunnel create kessoku-source       # creates the tunnel + credentials json
cloudflared tunnel route dns kessoku-source source.<your-domain>   # DNS CNAME
# config.yml:  tunnel: <id> / credentials-file / ingress: source.<domain> -> http://localhost:8088
cloudflared service install                     # registers a Windows service -> auto-starts on boot
```

Result: Windows service starts cloudflared at boot, container is already up via the
restart policy, hostname is stable. **Railway var = `https://source.<your-domain>`, set once.**
Nothing to touch after a reboot.

**What Claude needs from the user to build Path A:**
- A Cloudflare account (free).
- A domain added to that Cloudflare account (which one? could be a subdomain of an
  existing site, or a new cheap domain, or the brand domain if owned).

### Path B (fallback) — keep the ephemeral quick tunnel, automate the Railway update

No domain needed, but the URL still changes every boot, so a startup script must:
1. Start the quick tunnel and **capture the new `trycloudflare.com` URL** from its output.
2. Call the **Railway API** to set `NEXT_PUBLIC_SOURCE_SERVICE_URL` to that URL.
3. **Trigger a frontend redeploy** (because `NEXT_PUBLIC_*` is build-time baked).

Downsides: a redeploy on **every boot** (a few minutes where the site rebuilds), a stored
Railway API token on the laptop, and more moving parts. Only worth it if the user does not
want to put a domain on Cloudflare.

---

## Windows mechanics (applies to both paths)

- **Docker Desktop:** Settings -> General -> enable *"Start Docker Desktop when you log in"*.
  After that, the `restart: unless-stopped` policy brings both containers back automatically.
- **Tunnel auto-start:**
  - Path A: `cloudflared service install` registers a proper Windows service (cleanest, starts
    before login, survives logout).
  - Path B: a **Task Scheduler** task triggered *At log on* running a PowerShell script
    (start tunnel, parse URL, hit Railway API). Logon trigger because Docker Desktop only
    runs after login.
- **Health gate:** the startup script should wait for `http://localhost:8088/health` to return
  `{"ok":true}` before declaring success / before updating Railway (Path B), so it does not
  publish a URL that 502s while Docker is still spinning up.

---

## Deliverables when Claude builds this

- `services/source-service/scripts/` PowerShell script(s): a `startup.ps1` (health-gate +
  tunnel start, plus Railway update for Path B) and a `register-autostart.ps1` (installs the
  cloudflared service or the Task Scheduler task).
- A short "how it was wired" note appended to `docs/SHARE-FOR-TESTING.md`.
- For Path B only: documented, gitignored storage for the Railway API token (never committed).

---

## Open questions for the user (answer before Claude implements)

1. **Path A or B?** i.e. do you have / want a domain on Cloudflare for a stable URL (A),
   or stay fully account-light with an ephemeral URL + auto-redeploy (B)?
2. If **A**: which domain/hostname should the source-service live at?
3. Is this still laptop-only, or is the VPS move (roadmap) close enough that we should skip
   boot automation and do the VPS instead? On a VPS this whole brief collapses to "run the
   compose stack + a named tunnel as services", with no reboot churn.

---

## Roadmap fit

This is a stopgap for the **laptop-as-host** phase of Option B in
`docs/STREAMING-ROADMAP.md`. The endgame is the same source-service on a VPS with a
residential proxy, where auto-start is trivial and there is no bandwidth/uptime burden on
the laptop. Build this only if testing on the laptop will continue for a while before the
VPS move.
