# Provider Shortlist — Raw / Soft-Sub Streaming Sources (ranked)

Goal: move off **AnimePahe** (which **hardsubs** — English burned into pixels, so our
subtitle-overlay feature can't supply Indo/JP/EN) to a **raw or soft-sub Japanese**
source, so our own player can attach any-language WebVTT tracks (Indo via subdl, JP via
Jimaku, EN free with the stream).

Builds on [STREAMING-SOURCES-RESEARCH.md](STREAMING-SOURCES-RESEARCH.md) and
[SUBTITLE-SOURCING-RESEARCH.md](SUBTITLE-SOURCING-RESEARCH.md). This file is the
**provider-selection** layer: which streaming sources to integrate next, ranked, given
the no-VPS-yet reachability constraint.

> Research date: 2026-06-03. No active DPI/SNI probing was done (per task constraint);
> reachability is **reasoned** from the confirmed list + the real video host each
> provider streams from. Where a verdict is inferred rather than live-confirmed, it says so.

---

## 0. The reachability model (read this first — it drives every rank)

Three tiers, derived from the **confirmed** local probes:

| Tier | Meaning | Confirmed members |
|---|---|---|
| **REACHABLE** | works from the Indonesian residential IP today, no help | animepahe, google/cloudflare/anilist, **megaplay.buzz (HTTP 200)**, aniwatch.to (403 but reachable) |
| **CF-only** | reachable, just Cloudflare-challenged → **FlareSolverr** (already wired) clears it | (inferred: `api.allanime.day` — 403 CF, not blocked) |
| **ISP-BLOCKED** | SNI/DPI domain filter; TCP/TLS hangs; needs a **VPS** (no local DPI-bypass worked) | **hianime.to, megacloud.blog, 9animetv.to, kaido.to** |

**The load-bearing rule:** a provider is only as reachable as the **video host it
actually streams from**. Many "providers" are just a metadata/API front; the bytes come
from a CDN. If that CDN is `megacloud.blog` (ISP-BLOCKED) the provider is **dead-on-arrival
locally** even though its API front (often Cloudflare) is reachable. This single fact
eliminates most of the HiAnime ecosystem from the "viable now" column.

### What changed since the prior research docs (2026 industry collapse)

The earlier docs ranked **HiAnime via `aniwatch`** as the #1 soft-sub path (VPS-gated).
That is now **largely overtaken by events**:

- **HiAnime collapsed ~2026-03-13.** Its backend **MegaCloud** (the host that fed
  *hundreds* of mirror sites) is on the USTR "notorious markets" list and under active
  takedown/subpoena pressure. So even on a VPS, HiAnime itself is no longer a reliable
  origin — and `megacloud.blog` is **ISP-BLOCKED** here regardless.
- **AnimeKai shut down ~2026-05-10** (data-center fire in Almere; "our data center has
  been burned"). **Do not integrate it — it's gone.**
- **Anix / AniXL** — caught in the mass-shutdown wave; legal action prepared. Unstable.
- The **survivors** the community actually fell back to after HiAnime died are exactly
  **AnimePahe + AllAnime** (even Miruro, the best-regarded UI, now leans on these two).

So the realistic 2026 field is **much smaller** than the docs assumed. The soft-sub
dream did not survive HiAnime's death intact.

---

## 1. Ranked candidate providers

Scored on: **(a)** softsub/raw vs hardsub · **(b)** sub & dub · **(c)** likely reachable
from Indonesia (REACHABLE / CF-only-FlareSolverr / ISP-BLOCKED-needs-VPS) · **(d)**
extractor difficulty + whether a *maintained* extractor exists · **(e)** catalog
freshness for currently-airing.

| # | Provider | (a) Sub model | (b) Sub/Dub | (c) Reachable from ID? | Real video host | (d) Extractor difficulty / health | (e) Airing freshness | Verdict |
|---|---|---|---|---|---|---|---|---|
| **1** | **AnimePahe** *(current)* | **HARDSUB** | Sub + some dub | **REACHABLE** (DDoS-Guard via FlareSolverr) | `kwik` (kwik.cx/kwik.si) — reachable | ours, working in-repo | Good back-catalog; **lags airing** | **Keep as baseline.** Can't feed subtitle styling, but it's the one that *always works locally.* |
| **2** | **AllAnime** (allmanga) | **HARDSUB** (no separate VTT — confirmed) | **Sub + dub** (best dub coverage) | **CF-only → FlareSolverr** (`api.allanime.day` = 403 CF, *not* SNI-blocked) | **wixmp** (`repackager.wixmp.com`), `tools.fast4speed.rsvp`, sharepoint, mp4upload — **none are megacloud; not ISP-blocked** | **ALIVE — the one healthy extractor.** `pystardust/ani-cli` patched 2026-04/05 (AES-256-CTR, key `sha256("Xot36i3lK3:v1")`, Referer `youtu-chan.com`, persisted-query hash). Our `providers/allanime.ts` is still a **stub**. | **Best for airing/new titles** | **Integrate next (viable now).** Hardsub, so no soft-sub win — but it's the realistic coverage/fallback for titles AnimePahe lacks, and its CDNs are reachable. |
| **3** | **HiAnime / Zoro** (`aniwatch`) | **SOFT** (multi-lang VTT) — *the only true soft-sub path* | Sub + dub | **ISP-BLOCKED** (hianime.to + megacloud.blog both blocked) **and the site itself collapsed Mar 2026** | `megacloud.blog` / `s.megastatics.com` — **megacloud is ISP-BLOCKED** | `aniwatch` npm installs but repo **DMCA-frozen** (2026-03-23, Crunchyroll); upstream HiAnime **dead** | n/a (offline) | **Park.** Was the soft-sub dream; now needs a VPS *and* the origin is dying. The subtitle **CDN** (`s.megastatics.com`) is reachable, but page+stream extraction is not. |
| 4 | **Miruro** (aggregator) | Mixed: soft for "zoro/arc", **hardsub for "kiwi/pahe"** | Sub + dub | site reachable; but it **proxies through its own encrypted `/api/secure/pipe`** (ECDH) | rides AnimePahe + AllAnime now (post-HiAnime) | reverse-RE Python wrappers exist (`walterwhite-69/Miruro-API`, `mo7-mmed`), niche/unproven; re-derives keys we'd have to chase | good (uses the same two survivors) | **Skip as a source.** It's a *re-wrap of AnimePahe+AllAnime* behind an encryption layer we'd have to break — strictly more fragile than scraping those two directly. Useful only as a **UX reference**. |
| 5 | **MegaPlay.buzz / Anikoto** | iframe player (HiAnime library) — **soft inside the iframe**, but **not extractable** | Sub + dub | **REACHABLE (HTTP 200)** — but… | re-hosts the HiAnime/MegaCloud library | **Embed-only.** Docs: *"Direct Access to Embed Links are Disabled"*, postMessage-only. It's an **iframe**, not an m3u8+VTT API. | decent (HiAnime mirror) | **Treat as an EMBED provider, not a soft-sub source.** Belongs alongside Videasy/4Animo/NHDAPI in the existing iframe switcher — it can't hand our player a VTT track. Reachable = a good *embed* addition; useless for subtitle overlay. |
| 6 | **AnimeKai / Kaido** | (was soft, own player) | Sub + dub | — | MegaUp (datacenter-blocked CDNs) | — | — | **DEAD.** Shut down 2026-05-10 (data-center fire). Do not integrate. |
| 7 | **Anix / AniXL** | hardsub-ish | Sub + dub | unstable | mixed | caught in 2026 mass-shutdown; legal action prepared | unstable | **Skip.** Unstable / likely gone. |
| 8 | **KickAssAnime (Kaa)** | soft (own players: Bird/Duck) | Sub + dub | untested; historically Cloudflare | own obfuscated players | extractor was consumet-class (DMCA-frozen); JS player obfuscation; no maintained lib | moderate | **Skip for now.** No living extractor; obfuscation cost not worth it vs AllAnime. Re-evaluate only if AllAnime dies. |
| 9 | **Crunchyroll (official, via extractor)** | **SOFT** (real CR `.vtt`/`.ass`, incl. Indonesian) | Sub + dub (licensed) | API REACHABLE (Cloudflare/AWS) | Widevine/PlayReady **DRM** streams | **Infeasible/illegal:** forced DRM since 2025 broke yt-dlp/crunchy-cli; needs a **dumped L3 CDM** (device keys) to decrypt. | best (it's the licensor) | **Do NOT integrate as a video source.** DRM circumvention. **BUT** its *subtitles* already reach us cleanly — subdl/Jimaku redistribute CR's `Bahasa Indonesia` tracks (see subtitle research). Use CR for **subs via subdl**, not video. |
| 10 | **AnimeZ / animez.org** | hardsub (Indo streaming-site class) | Sub (Indo) | untested | Indo embed hosts | slug-keyed, breakage-prone, hardsub (same trap as Otakudesu/Samehadaku) | moderate | **Skip.** Hardsub, fragile, no soft-sub benefit. |
| 11 | **GogoAnime / anitaku** | hardsub | — | — | — | dead (per CLAUDE.md) | — | **Dead.** Ignore. |
| — | **Kitsunekko-raws** | n/a (it's a **subtitle dump**, not video) | n/a | reachable (static HTML) | n/a | JP `.srt`/`.ass`, no API, fuzzy-title only | n/a | **Not a video source.** Superseded by **Jimaku** for JP subs (API + AniList keys). Belongs in the subtitle doc, not here. |

---

## 2. TOP-3 RECOMMENDATION

The honest 2026 reality: **the soft-sub video dream (HiAnime) is dead/blocked, and the
only healthy extractor left (AllAnime) is hardsub.** So the path forward is **not**
"swap to a soft-sub stream" — it's "keep a reliable hardsub stream + overlay our own
subtitle tracks (subdl/Jimaku) on top," which the subtitle pipeline already does.

### Viable NOW (no VPS)

**#1 — AllAnime** *(integrate this next).*
- **Why:** It's the **single best move available without a VPS.** CF-only (FlareSolverr,
  already wired — *not* SNI-blocked), streams from **wixmp / fast4speed / sharepoint /
  mp4upload — none of which are the blocked megacloud**, and it's the **only extractor
  with a living, actively-patched reference** (`pystardust/ani-cli`, 12.5k★, patched
  2026-04/05). It has the **best airing-title + dub coverage**, which is exactly
  AnimePahe's weak spot (JJK S3 / new cours).
- **Caveat (be honest):** It is **hardsub** — it does **not** advance the soft-sub goal.
  Its value is **coverage/fallback** (a real second provider for titles AnimePahe lacks),
  not subtitle styling. Our `providers/allanime.ts` is still a stub; the old XOR-56 decode
  in the repo is outdated — port ani-cli's **AES-256-CTR** method.

**#2 — AnimePahe** *(keep as the always-on baseline).*
- **Why:** The one source confirmed **REACHABLE** and already playing end-to-end in-repo.
  Hardsub, lags airing — but it never goes dark locally. It stays the bottom of the chain.

**#3 — MegaPlay.buzz** *(add to the EMBED switcher, not the direct pipeline).*
- **Why:** Confirmed **HTTP 200 reachable** and it carries the **HiAnime library**
  (newest titles, sub+dub) that AnimePahe lacks — but it's **embed-only** (postMessage
  iframe, direct links disabled), so it **cannot** hand our player an m3u8+VTT. Slot it
  next to Videasy/4Animo/NHDAPI as another **iframe fallback server**. Cheap, reachable,
  fresh catalog — just not a soft-sub source.

### Unlocks ONLY after a VPS

- **HiAnime via `aniwatch`** — *the* soft-sub source (separate multi-lang VTT). But it's
  now **double-blocked**: ISP-SNI on `hianime.to`/`megacloud.blog` **and** the upstream
  site collapsed in March 2026 with MegaCloud under takedown. A VPS clears the SNI block,
  but you'd be betting on a dying origin + a DMCA-frozen `aniwatch` lib. **Lower-value
  than it was** — verify it even still resolves on a VPS before investing.
- **Direct multi-server choice** for the player generally needs the VPS (so HiAnime can
  join AllAnime+AnimePahe in a real direct fallback chain). Until then the *direct* chain
  is AnimePahe → AllAnime; everything else is the embed switcher.

### The single best "viable-now" pick

> **AllAnime.** It's reachable today (FlareSolverr clears its Cloudflare; its CDNs are
> not ISP-blocked), it's the only extractor with a maintained reference implementation,
> and it covers the airing/new titles AnimePahe misses. It won't give soft-subs — but
> **no reachable provider does** right now, so the right design is *AllAnime (coverage)
> + AnimePahe (baseline) for video, with subdl/Jimaku overlaying Indo/JP VTT on top.*
> Save the soft-sub HiAnime path for when a VPS exists, and only after re-confirming the
> post-collapse origin still works.

---

## 3. Underlying video hosts for the top picks (the dead-on-arrival check)

The reason ranking by "API reachability" alone is a trap — what matters is the **CDN the
bytes come from**:

| Provider | API/front host | **Actual video host(s)** | Host reachable from ID? | Net |
|---|---|---|---|---|
| **AnimePahe** | animepahe.* (DDoS-Guard) | **kwik** (`kwik.cx` / `kwik.si`) | **Yes** (FlareSolverr handles DDoS-Guard; segments fetch direct) | **OK locally** |
| **AllAnime** | `api.allanime.day` (Cloudflare) | **`repackager.wixmp.com`** (wixmp, m3u8), **`tools.fast4speed.rsvp`** (mp4), sharepoint, mp4upload | **Likely yes** — these are *not* megacloud/the blocked set; wixmp is a generic Wix CDN, fast4speed is its own host. (Reasoned, not live-probed — verify when wiring.) | **OK locally (pending probe)** |
| **MegaPlay.buzz** | `megaplay.buzz` (HTTP 200) | re-hosted HiAnime/MegaCloud library, served **inside its own iframe** | front Yes; but you only get the **iframe**, never the raw m3u8/segment URL | **Embed-only** |
| **HiAnime** *(VPS tier)* | hianime.to (SNI-blocked) | **`megacloud.blog` / `s.megastatics.com`** | **megacloud = ISP-BLOCKED**; subtitle CDN `s.megastatics.com` = reachable | **Dead locally** (needs VPS, and origin is dying) |

**Bottom line on hosts:** AllAnime is the only *non-AnimePahe* candidate whose **video
CDN is plausibly reachable without a VPS** (wixmp/fast4speed, not megacloud). That, plus
its living extractor, is why it's the next integration. Confirm wixmp/fast4speed
reachability with a one-off probe when you wire it — if either is silently SNI-blocked,
fall back to its sharepoint/mp4upload sources before declaring it dead.

---

## 4. Sources (2025-2026, verified this pass)

- ani-cli (AllAnime method, alive/patched; hosts wixmp/fast4speed/sharepoint/mp4upload; hardsub only): <https://github.com/pystardust/ani-cli> · PR #1410 "re-adding the wixmp provider" <https://github.com/pystardust/ani-cli/pull/1410>
- AllAnime separate-subtitle availability (rare, low — effectively hardsub): <https://github.com/pystardust/ani-cli/discussions/684>
- AnimeKai shutdown (data-center fire, 2026-05-10): <https://www.cbr.com/animekai-anime-streaming-site-shuts-down/> · <https://fandomwire.com/animekai-shutdown-explained/>
- HiAnime collapse (2026-03-13) + MegaCloud on USTR list / GitHub repo purge: <https://www.otakupt.com/anime/github-apaga-900-repositorios-pirataria-anime-hianime/>
- MegaPlay/Anikoto API (embed-only, HiAnime library, AniList/MAL endpoints): <https://megaplay.buzz/api>
- Miruro after HiAnime (removed ads, leans on remaining providers): <https://x.com/miruro_official/status/2032551606974071233> · Miruro-API reverse wrappers: <https://github.com/walterwhite-69/Miruro-API>
- AnimeKai extractor + MegaUp CDN datacenter-IP blocking (pre-shutdown context): <https://github.com/walterwhite-69/AnimeKAI-API>
- Crunchyroll forced DRM (Widevine/PlayReady, needs L3 CDM; breaks yt-dlp/crunchy-cli): <https://github.com/anidl/multi-downloader-nx> · DMCA wave: <https://github.com/github/dmca/blob/master/2026/03/2026-03-23-crunchyroll.md>
- Anix/mass anime-piracy shutdown wave (2025-2026): <https://www.cbr.com/anime-piracy-site-mass-shutdown/>
