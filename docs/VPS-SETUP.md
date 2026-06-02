# VPS — Insight & Beginner Tutorial (for the Option B source-service)

Plain-language guide to picking and setting up a VPS to host the anime
`source-service` (scraper + FlareSolverr + HLS proxy). Written for someone who has
never used a VPS.

---

## 1. What a VPS even is (30 seconds)

A **VPS** (Virtual Private Server) is just *a computer in a datacenter that you rent
and control over the internet*. You get a fresh Linux machine, an IP address, and
root (admin) access via **SSH** (a terminal connection). You install whatever you
want on it and it runs 24/7. That's it.

We need one because our scraper must run on a machine with a **non-home, always-on
IP** and the freedom to run Docker/FlareSolverr — which Railway (and Vercel) don't
allow the way we need.

---

## 2. The one thing that actually matters here: the IP reputation

Our blocker isn't CPU/RAM — it's **anti-bot (Cloudflare/DDoS-Guard)**. So:

- **Any datacenter IP can still get challenged.** A VPS is step 1, not a magic fix.
- The real unlock, *if* the VPS IP is challenged, is a **residential/ISP proxy**
  (you route only the provider's API/challenge calls through it). That's the main
  variable cost — but **don't buy it until the PoC proves the VPS IP alone fails.**
- So: pick a **cheap, easy** VPS first, test, and only add a proxy if needed.

---

## 3. Specs to pick

| Spec | Pick | Why |
| --- | --- | --- |
| RAM | **2 GB min** (4 GB comfy) | FlareSolverr launches a real Chromium; 1 GB will OOM |
| vCPU | 1–2 | enough for personal scale |
| Disk | 20–40 GB | OS + Docker images |
| OS | **Ubuntu 24.04 LTS** | best-documented, what this guide assumes |
| Region | **Singapore / Jakarta** | closest to Indonesia = lowest latency |

---

## 4. Which provider? (current options, approximate prices — verify on their site)

Ranked for *our* use case (cheap + Singapore region + beginner-friendly):

1. **Oracle Cloud — Always Free tier** · **$0/mo**
   - Free ARM VM up to 4 cores / 24 GB RAM, regions incl. **Singapore**. Plenty for us.
   - Trade-off: signup needs a card (not charged), ARM arch, and free capacity can be
     hard to grab. Most setup friction, but unbeatable price. FlareSolverr runs on ARM.
2. **Contabo — Cloud VPS** · **~$6–8/mo**
   - Lots of RAM for the money, has a **Singapore** region. Slightly oversold/slower,
     but fine for personal use. Great value.
3. **DigitalOcean — Basic Droplet** · **~$12/mo (2 GB)**
   - **Easiest** dashboard + the best beginner tutorials on the internet. **Singapore**
     region. Pricier per GB but the smoothest first-time experience. **Recommended if
     you want hand-holding.**
4. **Vultr / Linode (Akamai)** · **~$10–12/mo (2 GB)** — also have Singapore; similar
   to DO.
5. **Hetzner** · **~€4.5/mo (best value)** — but **EU/US only** (no Singapore), so
   higher latency from Indonesia. Great if region doesn't matter.

**My recommendation:**
- Want it free and don't mind fiddly setup → **Oracle Free (Singapore)**.
- Want cheap + simple → **Contabo (Singapore)**.
- Want the easiest possible first time, worth a few extra $ → **DigitalOcean (Singapore)**.

### 4b. Indonesian providers (no international card — pay with bank transfer / QRIS / e-wallet)

If international card signup fails (e.g. Oracle), use a **local Indonesian KVM VPS**.
Lowest latency (Jakarta), local-language support, pay in Rupiah. Pick a **"Cloud VPS"
/ "VPS KVM"** product (full root, Docker-capable) — **not** shared hosting.

| Provider | Notes | From |
| --- | --- | --- |
| **DomaiNesia** (domainesia.com) | Beginner-friendly, good ID docs, full-root KVM | ~Rp48k/mo |
| **Biznet Gio** (biznetgio.com) | Best network (Biznet backbone), explicitly Docker/K8s-ready | ~Rp50k/mo |
| **Nevacloud** (nevacloud.com) | Cheap NVMe KVM | ~Rp42k/mo |
| **Rumahweb / ArenHost / Natanetwork** | Cheap KVM, QRIS/OVO/DANA/GoPay | ~Rp40–50k/mo |

> **IMPORTANT — RAM:** the cheapest tiers are usually **1 GB / 1 vCPU**, which is
> **too small** (FlareSolverr launches Chromium → OOM). Pick a **2 GB+** plan even if
> it costs more (realistically ~Rp80–150k/mo). OS image: **Ubuntu 24.04**.

**My pick:** **DomaiNesia** (easiest + cheap + local payment) or **Biznet Gio** (best
network) — choose a **2 GB plan, Ubuntu 24.04**. Whether a local datacenter IP passes
Cloudflare is unknown until the PoC; that's exactly what Phase 1 tests.

> Card-free alternative to the global hosts: **DigitalOcean and Vultr accept PayPal**
> (no card), if you prefer their tooling over a local provider.

---

## 5. Step-by-step (using DigitalOcean as the example — others are nearly identical)

> You can do every "on the server" step yourself, or paste me the SSH access and I'll
> drive it. Either way, here's exactly what happens.

### 5.1 Create the server
1. Sign up at the provider; add a payment method.
2. Create a new VPS/"Droplet": **Ubuntu 24.04**, **2 GB / 1 vCPU**, region
   **Singapore**.
3. **Authentication: choose "SSH Key"** (more secure than password). On your laptop:
   ```powershell
   # Windows PowerShell — generate a key if you don't have one
   ssh-keygen -t ed25519 -C "animeflix-vps"
   # press Enter to accept the default path (~/.ssh/id_ed25519), set a passphrase
   type $env:USERPROFILE\.ssh\id_ed25519.pub   # copy this whole line into the provider's "SSH Key" box
   ```
4. Create the droplet. Note its **public IP** (e.g. `203.0.113.10`).

### 5.2 Connect
```powershell
ssh root@203.0.113.10        # type "yes" the first time
```
You're now on the server.

### 5.3 Base hardening + Docker (run these on the server)
```bash
# create a non-root user (safer)
adduser app && usermod -aG sudo app

# firewall: allow SSH + our service port
apt update && apt install -y ufw
ufw allow OpenSSH && ufw allow 8080/tcp && ufw --force enable

# install Docker + compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker app
```

### 5.4 Run the stack
Copy the `services/source-service` folder up (from your laptop):
```powershell
# from the repo root on your laptop
scp -r services/source-service app@203.0.113.10:/home/app/source-service
```
Then on the server:
```bash
cd /home/app/source-service
cp .env.example .env        # edit values if needed (nano .env)
docker compose up -d --build
docker compose logs -f      # watch it boot; Ctrl+C to stop watching
```
Health check from your laptop:
```powershell
curl http://203.0.113.10:8080/health      # expect {"ok":true}
```

### 5.5 (Later) Domain + HTTPS
Point a subdomain (e.g. `api.yourdomain.com`) at the IP (an `A` record), then put
**Caddy** in front for automatic HTTPS (we'll add a Caddy service to the compose file
in Phase 2). The Next.js frontend then calls `https://api.yourdomain.com`.

---

## 6. Cost summary

- **PoC (Phase 1):** just the VPS → **$0 (Oracle) to ~$12/mo (DO)**.
- **If the IP gets challenged:** add a residential/ISP proxy, usage-based, roughly
  **$2–10/mo** at personal scale (route only API/challenge calls through it; serve
  video segments direct).
- Everything else (FlareSolverr, our code) is free/open-source.

---

## 7. What I need from you to proceed

- Tell me which provider you picked (or want me to walk you through the signup).
- Once the VPS exists: either paste SSH access or screen-share the terminal and I'll
  guide each command. We deploy the skeleton, then implement + live-test the first
  provider (AllAnime) using `/playwright-cli` + `/web-scraping`.
