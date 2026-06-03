# Streaming Sources Research — Soft-Sub Hunt

Goal: find a **soft-sub** anime source (raw video + separate WebVTT/SRT/ASS tracks)
so our custom `HlsPlayer` can style/translate subtitles. Today only **AnimePahe**
works, and it **hardsubs** (subs burned into pixels — unstylable, untranslatable).

Scope: research + light live probing from this machine (Jakarta residential IP,
2026-06-03). Probe scripts: `services/source-service/scripts/research-softsub-*.mjs`.
Where something is blocked or unverifiable from here, it is called out explicitly.

> Player contract (the target shape). `frontend/components/watch/HlsPlayer.tsx`
> takes `subtitles: { url, lang, label? }[]` of WebVTT URLs; `types.ts` `Subtitle`
> is `{ url, lang, label? }`. So the job of any new provider is: return video
> `sources[]` **plus** `subtitles[]` of VTT URLs. AnimePahe returns `subtitles: []`.

---

## 0. The headline finding — March 2026 DMCA wave (changes everything)

A coordinated takedown gutted the scraper ecosystem **after** our roadmap was
written. Verified live via `gh api` (all return HTTP 451 "Repository access blocked"):

| Repo | Status | DMCA | Complainant |
|---|---|---|---|
| `ghoshRitesh12/aniwatch` (the HiAnime lib we depend on) | **taken down** | 2026-03-23 | Crunchyroll |
| `ghoshRitesh12/aniwatch-api` | **taken down** | 2026-03-23 | Crunchyroll |
| `yogesh-hacker/MegacloudKeys` (megacloud decrypt keys) | **taken down** | 2026-03-23 | Crunchyroll |
| `itzzzme/anime-api`, `yahyaMomin/hianime-API`, +3 HiAnime APIs | **taken down** | 2026-03-23 | Crunchyroll |
| `consumet/consumet.ts` + `consumet/api.consumet.org` | **taken down** | 2026-03-19 | DramaCool |

Source: github.com/github/dmca `2026/03/2026-03-23-crunchyroll.md`.

Consequence:
- **The two "canonical soft-sub paths" (aniwatch + consumet) lost their upstream
  source repos.** The npm packages still *install* (we have `aniwatch@2.27.9`, last
  npm publish 2026-03-14 — ~9 days before the repo died; `@consumet/extensions@1.8.8`,
  2026-01-20), but they are now **frozen/abandoned**: no fixes when HiAnime/megacloud
  rotates its decryption. Megacloud changes break extraction every few weeks and the
  key repo that the community relied on is gone. **High rot risk.**
- **The survivor is `pystardust/ani-cli`** (12.5k★, GPL-3.0, NOT taken down, pushed
  2026-05-23) which scrapes **AllAnime** and was actively patched in 2026-04 for
  AllAnime's AES-256-CTR key change. AllAnime is the path that still has a living
  reference implementation. But AllAnime is **hardsub** (see §3).

So the soft-sub question is now a tension: **HiAnime is the only real soft-sub
source, but its tooling is freshly DMCA'd and frozen; AllAnime's tooling is alive
but it's hardsub.**

---

## 1. Ranked comparison

Ranking criterion #1 is **soft-sub vs hardsub**, then tooling survivability, then
feasibility from our infra.

| # | Source | Sub model | External VTT? | Lib / extractor | Lib status | Anti-bot | Laptop | VPS | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **HiAnime / Zoro** | **SOFT** | **Yes — multi-lang VTT** (`s.megastatics.com`) | `aniwatch` npm (dep) | **frozen** (repo DMCA'd 2026-03-23; npm v2.27.9 still installs) | Cloudflare + megacloud crypto | **blocked** (522 / SNI hang) | **likely OK** | **Implement next — only true soft-sub path** |
| **2** | **AllAnime** | hardsub | No (video m3u8 only) | ani-cli method (no npm; port from `pystardust/ani-cli`) | **alive**, patched 2026-04 | Cloudflare (FlareSolverr handles) | **OK** (host reachable) | OK | Best *survivability* + new-title coverage, but **no soft-subs** |
| **3** | **AnimePahe** *(current)* | **hardsub** | No | in-repo `providers/animepahe.ts` | ours, working | DDoS-Guard (FlareSolverr) | OK | OK | Keep as baseline; can't restyle/translate its subs |
| 4 | Miruro | soft (mirrors HiAnime/megacloud) | Yes (inherited) | `walterwhite-69/Miruro-API` (Python, 28★) | niche, unproven | same megacloud crypto | untested | maybe | Just a re-wrap of the same fragile megacloud layer; no advantage over #1 |
| 5 | AnimeKai / Kaido | soft (own player) | Yes, but heavy obfuscation | consumet (DMCA'd) / 3rd-party | abandoned | aggressive JS/Cloudflare | untested | hard | Hardest anti-bot; tooling dead — skip |
| 6 | GogoAnime / anitaku | hardsub | No | gogoanime forks | dead | — | — | — | Permanently dead (per CLAUDE.md); ignore |
| — | OpenSubtitles (companion) | n/a (subs only) | **Yes — SRT→VTT** | OpenSubtitles REST API | alive, official | API key, rate-limited | OK | OK | **Not a video source** — pairs with a hardsub source to *add* an Indonesian track |

---

## 2. #1 — HiAnime / Zoro (via `aniwatch`)  — the only real soft-sub path

**Sub model: SOFT.** HiAnime serves raw m3u8 (from megacloud/megastatics) **plus
separate WebVTT subtitle files** hosted on `s.megastatics.com/subtitle/...`. Its own
player shows a language menu (English, Spanish, Portuguese, Arabic, Indonesian for
some titles, …). This is precisely what we want.

**External tracks — exact shape.** `aniwatch@2.27.9` type defs
(`node_modules/aniwatch/dist/index.d.ts`) confirm `getEpisodeSources()` returns:
```ts
type ScrapedAnimeEpisodesSources = {
  headers?: { [k: string]: string };
  intro?: { start: number; end: number };
  subtitles?: { id?: string; url: string; lang: string }[];   // <-- soft-sub VTTs
  sources: { url: string; quality?: string; isM3U8?: boolean }[];
  ...
};
```
So `subtitles[]` is `{ url, lang }` of VTT URLs. `lang` is a full word ("English",
"Spanish - Latin America"). A `lang === "thumbnails"` entry is included for the
scrubber preview and must be filtered out. (Note: older aniwatch nested these under
`tracks[]` with `kind:"captions"`; the in-repo `scripts/test-hianime.mjs` still reads
`sources.tracks` — that field is wrong for v2.27.9, it must read `sources.subtitles`.)

**Lib maintenance: FROZEN / abandoned upstream.** `aniwatch` npm latest = **2.27.9**,
last modified 2026-03-14; the GitHub repo was DMCA'd by Crunchyroll **2026-03-23**.
The package still installs and the code we have is intact, but there will be **no
upstream fixes** when megacloud rotates its embed/decryption (which it does often).
Plan to vendor/pin it and be ready to patch the megacloud extractor ourselves.

**Anti-bot: Cloudflare + megacloud crypto.** Two layers: (a) Cloudflare on the page
hosts, (b) megacloud's encrypted embed that `aniwatch` decrypts internally. Our
FlareSolverr handles (a)-class Cloudflare; (b) is inside the lib (the risk surface).

**Feasibility — laptop vs VPS (LIVE-VERIFIED, honest):**
`scripts/research-softsub-hianime.mjs` from this residential IP:
```
aniwatchtv.to    ip=172.67.178.130  HTTP 522 (cloudflare, origin unreachable, ~19s, reproducible)
hianime.to       ip=104.21.0.192    CONNECT hangs -> abort at 30s
hianimez.to      ip=104.20.19.210   HTTP 301 then hangs on follow
megacloud.blog   ip=104.21.83.221   CONNECT hangs -> abort at 30s
extractor (aniwatch.search) -> "fetchError: Something went wrong"
```
- **DNS resolves fine** (Cloudflare IPs) — it is *not* a DNS block.
- `aniwatchtv.to` returns a reproducible **522** (Cloudflare reached, HiAnime origin
  dead behind it — a HiAnime-side problem, not purely our IP). The other page hosts'
  TCP/TLS just **hang** — the signature of SNI-based filtering common on Indonesian
  ISPs. Mixed cause; either way **HiAnime page extraction does not work from this
  laptop today.**
- **BUT the subtitle CDN is reachable from the laptop:** `s.megastatics.com` → **HTTP
  200** in 1.3s (`scripts/research-softsub-vtt-shape.mjs` / direct probe). So once the
  m3u8 + VTT URLs are obtained (on a VPS), **the VTT files themselves can be fetched
  and proxied even from here.** Only the *page-extraction* step needs a clean IP.
- **VPS: likely works.** A clean datacenter IP (ideally non-blocked region) sidesteps
  the SNI hang; the 522 is HiAnime-side and intermittent. Cannot be 100%-confirmed
  without running it on the VPS — flagged as the one open verification.

**Legal/ToS:** HiAnime is an unauthorized streaming site; `aniwatch` was DMCA'd by
Crunchyroll as circumvention tooling. Same legal posture as our existing AnimePahe
scraping — scrape responsibly (low rate, real UA), self-host, no redistribution.

---

## 3. #2 — AllAnime  — survivable, but HARDSUB

**Sub model: HARDSUB (for our purposes).** AllAnime aggregates third-party video
hosts; its `sourceUrls` decode to clock/links endpoints that return **video m3u8/mp4
only**. The live ani-cli implementation (`scripts/research-softsub-allanime.mjs`
documents it) fetches **no separate VTT/caption track** — subs are baked into the
stream. So AllAnime does **not** satisfy the soft-sub goal even though it's the
healthiest extractor.

**Lib maintenance: ALIVE (the only one).** No maintained npm wrapper, but
`pystardust/ani-cli` (12.5k★, GPL-3.0) is the reference and is actively patched:
- 2026-04-20 `fix: allanime openssl aes-256-ctr decryption`
- 2026-04-24 `fix: update allanime key and ct_len`
- 2026-05-01 `fix: update api_resp req including query_hash and origin`

Current method (verified from ani-cli master): API `https://api.allanime.day/api`,
Referer `https://youtu-chan.com`, UA `Firefox/150.0`, episode via persisted-query
hash, sourceUrl decode = **AES-256-CTR**, key = `sha256("Xot36i3lK3:v1")`, IV = bytes
1–13, counter `${iv}00000002`. (Our in-repo `providers/allanime.ts` is still a STUB;
the old probe scripts use the *legacy* XOR-56 decode + `allanime.to` referer, which
is now outdated — the encryption changed.)

**Anti-bot: Cloudflare, FlareSolverr-handled.** `api.allanime.day` → **403 CF in
101ms** from the laptop (reachable, just gated). The roadmap's noted `episode`
resolver error ("Cannot set property 'countryOfOrigin' of undefined") is most likely
the stale query shape; ani-cli's current persisted-query hash is the fix to try.
I could not re-run the full FlareSolverr flow from the laptop shell because
FlareSolverr's :8191 is only published on the docker network (not the host), and I
avoided `docker exec` into the running production container. Re-verify by running
`research-softsub-allanime.mjs` inside that network.

**Feasibility:** **laptop OK** (`allanime.day` 301, `allmanga.to` 200, both ~60–96ms
via FlareSolverr). VPS OK. This is why the roadmap picks AllAnime as the next
*coverage/fallback* provider — just not for soft-subs.

**Legal/ToS:** Unauthorized aggregator; same posture as above.

---

## 4. #3 — AnimePahe (current baseline)

**Sub model: HARDSUB.** Confirmed in code: `providers/animepahe.ts` returns
`subtitles: []`; the kwik m3u8 has Japanese audio + **burned-in** English subs
(`audio: 'jpn'` = subbed-hard). This is the exact limitation that triggered this
research. Works reliably (DDoS-Guard via FlareSolverr), good back-catalogue, **lags
new/airing titles**. Keep it as the always-on baseline; it can never feed our subtitle
styling.

---

## 5. Companion path — OpenSubtitles (add an Indonesian track to a hardsub source)

Not a video source, but the pragmatic way to get an **Indonesian** (or restyled
English) track onto AnimePahe/AllAnime today, since those are hardsub:
- OpenSubtitles REST API (official, alive, API-keyed) → download `.srt` → convert to
  `.vtt` → serve via our `/api/subs` proxy → feed our player's `subtitles` prop.
- This is already **Phase 3** in the roadmap and `config.ts` already reserves
  `openSubtitlesApiKey`. It pairs with any hardsub video: the burned-in English stays,
  and we overlay our own toggleable Indonesian VTT.
- Caveat: OpenSubtitles timing often won't match a specific encode frame-accurately;
  per-release matching by hash/episode is needed. It complements, not replaces, a true
  soft-sub source.

---

## 6. Probe scripts written (live-runnable)

- `scripts/research-softsub-hianime.mjs` — (A) raw host reachability diagnosis
  (DNS vs TCP vs Cloudflare-challenge vs 522) + (B) full `aniwatch` pipeline; prints
  whether `subtitles[]` VTTs come back. **Ran it; results in §2.**
- `scripts/research-softsub-allanime.mjs` — documents + executes the current ani-cli
  AllAnime method through FlareSolverr; checks for any subtitle field (expects none =
  hardsub). **Ran it; FlareSolverr not host-published, so it printed the method +
  hardsub note as designed.**
- `scripts/research-softsub-vtt-shape.mjs` — proves the end-to-end VTT contract:
  maps `aniwatch.subtitles[]` → our `Subtitle[]` (lang-word→ISO, drops `thumbnails`),
  and (given a real VTT url) validates it's `WEBVTT` with cues. **Ran it; mapping
  verified.** Subtitle CDN `s.megastatics.com` confirmed reachable (200) from laptop.

---

## 7. #1 RECOMMENDATION + concrete integration path

**Implement HiAnime via `aniwatch` as the soft-sub provider — but run its extraction
on the VPS, not the laptop.** It is the *only* source that yields separate,
multi-language WebVTT tracks our player can style and translate. Pair it behind
AnimePahe in the existing fallback chain (AnimePahe stays the reliable hardsub
baseline; HiAnime is tried first when we want soft-subs / newer titles). Vendor/pin
`aniwatch@2.27.9` and be ready to patch the megacloud extractor in-house, since
upstream is DMCA-frozen.

**Concrete integration (drop-in for a new `providers/hianime.ts`):**
```ts
import { HiAnime } from 'aniwatch';                 // already in package.json
const hianime = new HiAnime.Scraper();

// 1) search by title -> pick show id
const { animes } = await hianime.search(params.titles.find(Boolean)!);
const anime = animes[0];                            // + your title-match logic

// 2) episode list -> episodeId for params.episode
const { episodes } = await hianime.getEpisodes(anime.id);
const target = episodes.find(e => e.number === params.episode) ?? episodes[params.episode-1];

// 3) sources + SUBTITLES (server 'hd-1'; category 'sub' | 'dub')
const r = await hianime.getEpisodeSources(
  target.episodeId, 'hd-1', params.category,        // category is our 'sub'|'dub'
);

// r.sources   : { url, isM3U8 }[]          -> map to our Source[]
// r.subtitles : { url, lang }[]            -> map to our Subtitle[]  (THE PAYOFF)
// r.headers   : { Referer, ... }           -> pass to the HLS proxy
// r.intro     : { start, end }             -> future skip-intro

const subtitles = (r.subtitles ?? [])
  .filter(s => s.url && s.lang && !/thumbnail/i.test(s.lang))   // drop scrubber track
  .map(s => ({ url: s.url, lang: ISO[s.lang.toLowerCase()] ?? s.lang.slice(0,2).toLowerCase(),
               label: s.lang }));            // -> types.ts Subtitle { url, lang, label? }

return { provider: 'hianime', sources, subtitles, headers: r.headers };
```
The returned `subtitles` is exactly the `subtitles` prop `HlsPlayer` expects — its
`<track src=… srcLang=… label=…>` + custom cue renderer takes over from there.

**Two implementation notes (verified):**
1. **Proxy the VTTs through `/api/subs`** (or the HLS proxy with the right Referer).
   `s.megastatics.com` is reachable from our infra (200 from the laptop), but the
   `<track>` element needs same-origin/CORS-clean VTT URLs, and some megastatics paths
   401 without `Referer: https://megacloud.blog/`. Route them through our proxy with
   that header, like we already do for kwik m3u8.
2. **Run extraction on the VPS.** From this laptop the HiAnime *page* hosts are
   blocked/522 (proven in §2). Everything downstream (VTT fetch/proxy) works from
   anywhere. So the laptop can dev/test the proxy + player glue against a sample VTT,
   but the `search → getEpisodeSources` step must run where the IP is clean.

**The one thing still to verify (be honest):** that `aniwatch` actually returns
`subtitles[]` end-to-end from the **VPS** (the laptop can't reach the page hosts to
prove it live). Run `node scripts/research-softsub-hianime.mjs "Frieren" 1 sub` on the
VPS; success = it prints `subtitles` rows with `.vtt` URLs and "SOFT-SUB SUCCESS".
