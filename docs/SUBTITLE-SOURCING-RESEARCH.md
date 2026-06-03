# External Subtitle Sourcing — Research & Ranking

Goal: feed our custom player (`frontend/components/watch/HlsPlayer.tsx`) **external
WebVTT tracks** — especially **Indonesian (`id`)**, plus other languages — as
separate files keyed off our **AniList id** (with title + MAL id also on hand).

This is research, not a build. Every claim below is backed by a live probe or a
fetched 2025–2026 doc. Probe scripts live in
`services/source-service/scripts/research-subs-*.mjs` and were run on
2026-06-03 (Node v24).

> **TL;DR.** For **English**, don't build a subtitle pipeline at all — the
> soft-sub streaming sources we already use (HiAnime/Zoro via `aniwatch`,
> consumet) hand us an English `.vtt` track with the stream. For **Japanese**,
> **Jimaku** is the clean, AniList-keyed winner. For **Indonesian**, **subdl is
> genuinely viable for current/popular anime** — CORRECTION to the original
> pessimistic verdict, now verified live with a real key (2026-06-03): subdl
> serves **per-episode, Crunchyroll-sourced Indonesian** tracks (downloadable
> `.zip` → `.ass`/`.srt`) for Frieren, Jujutsu Kaisen, Demon Slayer, Spy×Family,
> Mushoku Tensei, Oshi no Ko, Solo Leveling, …. Coverage is **good for recent
> simulcast titles, thin-to-none for older classics** (Naruto / One Piece /
> Steins;Gate ≈ 0 per-episode). The earlier "not realistically attainable" claim
> came from a **probe bug** (it filtered `language === 'Indonesian'` while the API
> returns the code `'ID'`). End-to-end chain verified: list → download zip →
> unzip → real CR `Bahasa Indonesia` `.ass` → (ASS→VTT) → player.

---

## 0. The shortcut you must not over-build past

Anime subs split into three realities:

| Language | Where it already is | Do we need a separate source? |
|---|---|---|
| **English** | Bundled as a `.vtt` track by the soft-sub stream itself (HiAnime/Zoro via the `aniwatch` lib; consumet). The scraper returns `subtitles: [{ lang: "English", url: "...vtt" }]`. | **No.** We get English VTT for free with the video. |
| **Japanese** | Not bundled; lives on Jimaku/Kitsunekko as `.srt`/`.ass`. | Yes — Jimaku. |
| **Indonesian** | Mostly hardsubbed on Indo streaming sites — **but subdl serves clean, downloadable, per-episode (often Crunchyroll) tracks for current/popular anime** (verified). Sparse for old classics. | Yes — subdl. The real gap is only older/niche titles. |

So the engineering effort should target **Indonesian + occasional other
languages**, and treat English as solved by the stream we already resolve. Don't
stand up an OpenSubtitles/Jimaku English pipeline — it's wasted work.

(Note: AnimePahe, one of our stream providers, is **hardsubbed** — its subs are
burned into the video and cannot be extracted as a track. Same trap applies to
every Indonesian streaming scraper below.)

---

## 1. Ranked sources

Ranked by usefulness **for our actual goal** (external tracks, AniList-keyed,
Indonesian-first then other langs).

### #1 — Jimaku.cc  ·  best for Japanese, AniList-native, but **not Indonesian**

| | |
|---|---|
| **Access** | REST API, `https://jimaku.cc/api`. **API key mandatory on every endpoint** (including search) — verified: no-key request returns **401**. Free key from your account page after signing in (Discord login). |
| **Key endpoints** | `GET /entries/search?anilist_id={id}` → entry objects; `GET /entries/{entryId}/files` → `[{ name, url, size, last_modified }]`; file `url` is a direct download. |
| **id mapping** | **AniList-native.** Entries are *required* to carry an AniList id (live-action uses TMDB). This is the cleanest mapping of any source — our primary id is a first-class lookup key. Episodes are addressed by matching the episode number inside the filename (Jimaku stores files, not a structured episode index). |
| **Format** | `.srt` and **`.ass`** (often `.ass` for anime — positioned/styled). Needs ASS→VTT conversion (see §3). |
| **Anime coverage** | **Excellent** for any reasonably popular anime — this is *the* community Japanese-sub repo, successor to Kitsunekko. |
| **Indonesian** | **Effectively none.** Jimaku is explicitly "a site for hosting **Japanese** subtitles." Files are overwhelmingly Japanese, with some English. Indonesian is not a meaningful offering. |
| **Probe** | `scripts/research-subs-jimaku.mjs` — confirmed the 401 auth wall and documents the exact 2-call flow (search→files) it runs once a key is supplied. |

**Verdict:** Adopt Jimaku for **Japanese** tracks (great for a JP-learning
audience) because the AniList keying is frictionless. It does **not** solve the
Indonesian gap.

---

### #2 — subdl.com  ·  the only source with a real Indonesian catalogue + an API

| | |
|---|---|
| **Access** | REST API, `GET https://api.subdl.com/api/v1/subtitles`. **`api_key` query param mandatory** — verified: no-key request returns **422** validation error. Free key from `https://subdl.com/panel/api`. |
| **Lookup params** | `film_name=` (title search) **or** `sd_id` / `imdb_id` / `tmdb_id`; for series `type=tv&season_number=&episode_number=`; `languages=ID,EN` (comma-separated); `subs_per_page` (≤30), `unpack=1` to list per-episode files inside season packs. |
| **id mapping** | **IMDb / TMDB-keyed** (or title text-search). **No AniList, no AniDB.** To use ids you must map AniList→IMDb/TMDB first (see §4). In practice title search (`film_name`) is the pragmatic path for anime. |
| **Format** | ZIP (`https://dl.subdl.com/subtitle/...`) → unzip → **`.srt` OR `.ass`**. CR-sourced Indonesian rips are **`.ass`** (verified: a Frieren S02E01 zip held `…Bahasa Indonesia.ID.ass`, `Original Script: Crunchyroll`); community uploads are often `.srt`. SRT→VTT trivial; ASS→VTT lossy-but-fine for dialogue (§3). |
| **Anime coverage** | **Good for current/recent simulcast TV** — verified per-episode (`languages=ID`): Frieren, JJK, Demon Slayer, Spy×Family, Mushoku Tensei, Oshi no Ko all return ≥ the 30-row page cap; Solo Leveling 18. **Thin-to-none for older classics** (Naruto/One Piece/Steins;Gate/Bocchi ≈ 0 per-episode). Plus movies. (The earlier "thin/spotty" verdict was understated — corrected after fixing the probe's ID-counter bug.) |
| **Indonesian** | **Yes — first-class (`ID` code), much of it Crunchyroll-sourced** (professional, per-episode) for current titles. The best API-accessible Indonesian option by far. **Integration note:** query `languages=ID` alone — a combined `ID,EN` lets EN fill the 30-row page and hide the ID rows. |
| **Probe** | `scripts/research-subs-subdl.mjs` — confirmed the 422-without-key behavior; with a key it prints a per-language histogram and lists every `language="indonesian"` hit. |

**Verdict:** **The recommended Indonesian source** — it is the only one that
combines a real API, the `id` language, and a download URL. Set expectations:
coverage is partial, IMDb-keyed, and you'll lean on title search.

---

### #3 — AnimeTosho  ·  free key-less API, **English `.ass` only**, AniDB-keyed

| | |
|---|---|
| **Access** | **No API key, no auth.** JSON API at `https://feed.animetosho.org/json?q={title}` — verified **200**, returned 75 Frieren releases. RSS/Atom + NZB feeds also exist. |
| **id mapping** | Items carry **AniDB ids** (`anidb_aid`, `anidb_eid`), **not AniList**. Map AniList→AniDB via Fribb/anime-lists or ARM (§4), or just text-search by title. Caveat: AniDB splits seasons into separate `aid`s (our probe saw `aid=18886` for Frieren S2 while the mapping file lists S1 `aid=17617`), so episode mapping is fiddly. |
| **Format** | **`.ass`** extracted from release files. Verified on a real release view page: an *Extractions → Subtitles* block offers direct downloads like **"English [eng, ASS]"** and an "All Attachments [.7z]" bundle — downloadable **without** the torrent. The JSON feed gives `article_url`; the attachment links are on that HTML view page (so it's API-find + scrape-the-attachment). |
| **Anime coverage** | **Excellent** as a release index — basically everything fansubbed/WEB-released. |
| **Indonesian** | **Near-zero.** Extracted subs are whatever the **release group** shipped — overwhelmingly **English** (+ JP/signs). Indo fansub groups don't release through the BitTorrent scene AnimeTosho indexes. |
| **Probe** | `scripts/research-subs-animetosho.mjs` — confirmed the key-less 200, the AniDB keying, and the English-`.ass`-attachment reality. |

**Verdict:** A strong **English `.ass`** fallback (no auth, huge catalogue) **if**
we ever want styled English over the stream's plain VTT — but English is already
solved (§0), and it does nothing for Indonesian. Low priority.

---

### #4 — OpenSubtitles.com REST API  ·  broad but anime-hostile mapping, sparse Indo anime

| | |
|---|---|
| **Access** | `https://api.opensubtitles.com/api/v1`. **`Api-Key` header mandatory** — verified: no-key request returns **403 "You cannot consume this service."** Free key by registering an *API consumer* at `https://www.opensubtitles.com/en/consumers`. |
| **Search / download** | `GET /subtitles?query=&languages=id&season_number=&episode_number=` (or `imdb_id`/`tmdb_id`/`parent_imdb_id`); `POST /download` with a `file_id` returns a temporary `.srt` link. |
| **id mapping** | **The anime pain point.** Keyed on **IMDb/TMDB**, which are **series-level** for anime. AniList splits a show into per-cour entries with their own ids and per-cour episode numbering; IMDb lumps everything into one series with absolute/TVDB-style numbering. So `AniList(id, ep)` → `IMDb(series, season, ep)` is **lossy and error-prone** — you must map AniList→IMDb (§4) *and* guess the season/episode offset. Frequent misses on long or multi-cour shows. |
| **Format** | `.srt` (SRT→VTT is trivial). |
| **Anime coverage** | Mediocre for anime episodes; decent for anime **films**. It's a live-action-first archive. |
| **Indonesian** | Indonesian exists in the catalogue broadly, but **Indonesian *anime-episode* subs are sparse**. |
| **Limits** | Free: **~5 downloads/day anonymous, ~20/day with a free account**; search is rate-limited per key; VIP tiers raise quotas. The ~20/day download cap alone makes it unfit as a primary backfill source. |
| **Probe** | `scripts/research-subs-opensubtitles.mjs` — confirmed the 403 auth wall; with a key it reports `total_count` + a per-language histogram per query. |

**Verdict:** Not worth the integration cost for our goal. The IMDb mapping pain +
20/day cap + weak anime-episode Indo coverage outweigh its breadth.

---

### #5 — Kitsunekko  ·  Japanese-only file dump, no API

| | |
|---|---|
| **Access** | **No API.** Static directory listing at `https://kitsunekko.net/subtitles/` — you'd scrape `Index of /` HTML. A maintained mirror exists at `github.com/Ajatt-Tools/kitsunekko-mirror`. |
| **id mapping** | **None** — folders are named by (mostly romaji/Japanese) title. AniList→fuzzy-title-match only. Brittle. |
| **Format** | `.srt` / `.ass`. |
| **Anime coverage** | Large historical JP catalogue (Jimaku is its modern successor). |
| **Indonesian** | **None.** Japanese (some English). |
| **Probe** | Not scripted — it's a plain HTML dir-scrape with no language or id signal worth probing; Jimaku supersedes it for the JP use case. |

**Verdict:** Skip. Jimaku is strictly better (API + AniList keys) for the same
(Japanese) content.

---

### #6 — Addic7ed  ·  TV-show site, no real API, no anime/Indo value

| | |
|---|---|
| **Access** | **No official API.** Third-party wrappers (`matcornic/addic7ed`, `niksy/addic7ed-subtitles-api`) **scrape the HTML** search. Fragile, ToS-gray. |
| **id mapping** | Show/season/episode by **title** — no AniList/IMDb id input. |
| **Format** | `.srt`. |
| **Anime coverage** | **Poor** — Addic7ed is Western-TV-centric; only a handful of anime. |
| **Indonesian** | Negligible; English-dominant. |
| **Probe** | Not scripted — no API to probe; scraping it adds nothing toward Indonesian. |

**Verdict:** Skip entirely. Wrong catalogue, wrong language, no API.

---

## 2. The Indonesian reality (revised after live testing)

**Correction.** The first pass concluded "no clean API serves Indonesian anime
tracks." Live testing with a real subdl key (2026-06-03) disproved that for
current titles. The accurate picture:

1. **subdl is the real path.** `languages=ID` returns **per-episode, downloadable,
   often Crunchyroll-sourced** Indonesian tracks for current/popular anime (§1 #2).
   IMDb/title-keyed; `film_name` search works well. Verified end-to-end (download →
   unzip → real `Bahasa Indonesia` `.ass`).
2. **Indo streaming-scraper APIs** (`miukyo/aniyoi-api`, the `sankavollerei`
   Otakudesu/Samehadaku APIs) are slug-keyed, breakage-prone, and serve
   **hardsubs** (another stream, not a track) — still not useful.
3. **Fansub `.ass`** from the BitTorrent scene (AnimeTosho) — overwhelmingly
   English; Indonesian absent there.

**Realism verdict (revised):** Indonesian is **readily available for current and
recent popular anime** via subdl (the simulcast era — the bulk of what users
actually watch), and **sparse for older / classic / niche** titles. So promise
Indonesian *"where we have it"* (strong for new/popular, gaps on old shows), and
keep **server-side machine translation** as the optional fallback for the long
tail. Caveats: coverage per page caps at 30 (paginate for long series); subs are
timed to a specific encode (CR WEB-DL) so sync vs our AnimePahe video may drift a
little; quality varies for non-CR community uploads.

---

## 3. Format / conversion complexity (`.ass` vs `.vtt`)

Our player consumes **WebVTT** `<track>` elements (`HlsPlayer.tsx` renders cues
itself for styling). Conversion difficulty by format:

- **SRT → VTT:** trivial. Add `WEBVTT\n\n` header, change `,` to `.` in
  timestamps. Lossless. (subdl, OpenSubtitles are SRT — easy.)
- **ASS/SSA → VTT:** **lossy and non-trivial.** `.ass` carries absolute
  positioning, multiple styles, fonts/colors, karaoke timing, and overlapping
  signs. Plain VTT can't represent most of that. A converter (e.g. server-side
  with `ffmpeg -i in.ass out.vtt`, or a JS lib) gets you readable dialogue but
  **drops styling/positioning and mangles karaoke/signs**. Since our player
  applies *its own* caption styling anyway, dropping ASS styling is acceptable
  for **dialogue**, but typesetting-heavy shows will lose signs. (Jimaku and
  AnimeTosho are frequently `.ass` — flag this.)

Recommendation: do conversion **server-side in source-service** and cache the
VTT, so the player only ever sees clean VTT.

---

## 4. AniList → everything else: the id-mapping bridge

Only **Jimaku** takes our AniList id directly. Everyone else needs a hop. The
practical bridge (verified live):

- **`github.com/Fribb/anime-lists`** (`anime-list-mini.json`, 42,147 entries) —
  verified: AniList `154587` → `{ anidb_id: 17617, imdb_id: "tt22248376",
  themoviedb_id: {tv:209867}, tvdb_id: 424536, mal_id: 52991, kitsu_id: 46474 }`.
  One static file maps AniList → **AniDB / IMDb / TMDB / TVDB / MAL**. Cache it in
  source-service and you can feed AnimeTosho (AniDB), subdl/OpenSubtitles
  (IMDb/TMDB).
- **`arm.haglund.dev`** (ARM) and **nattadasu/animeApi** — live API equivalents
  if you prefer a service over a static file.

Caveat already observed: **AniDB and IMDb both split/merge seasons differently
from AniList**, so even with the id you must reconcile season/episode numbering.
This is the structural reason anime subtitle mapping is hard everywhere except
Jimaku.

---

## 5. Recommendation

1. **English — do nothing new.** Use the `.vtt` track the soft-sub stream
   (`aniwatch`/HiAnime, consumet) already returns. (Verify it surfaces in our
   resolver's output and gets passed to `HlsPlayer`'s `subtitles` prop.)
2. **Japanese — integrate Jimaku.** Cleanest source, AniList-native, one key.
   Search by `anilist_id`, list files, match episode number, ASS→VTT server-side.
3. **Indonesian — integrate subdl (now a real win for current titles).** Query
   `languages=ID` by title; download the `.zip`, unzip, convert `.ass`/`.srt` → VTT
   server-side, cache. Good coverage for recent/popular anime, gaps on old
   classics — surface honestly in the UI ("Indonesian subs where we have them").
   Add an optional MT fallback for the long tail later.
4. **Optional English styled fallback — AnimeTosho** (no key) if we ever want
   release-quality `.ass` over the plain stream VTT. Low priority.
5. **Skip** OpenSubtitles (mapping pain + 20/day cap), Kitsunekko (Jimaku
   supersedes), Addic7ed (wrong catalogue).
6. **Indonesian Plan B (if coverage matters more than purity):** server-side
   **machine-translate** the Jimaku/stream English track to Indonesian and cache
   the VTT. Label it clearly as auto-translated.

### API keys the user must obtain

| Source | Why | Where to sign up | Free tier |
|---|---|---|---|
| **Jimaku** (Japanese) | mandatory on every endpoint (401 without) | `https://jimaku.cc/account` (sign in, then generate key) | free |
| **subdl** (Indonesian) | mandatory `api_key` (422 without) | `https://subdl.com/panel/api` (register, copy key) | free |
| *OpenSubtitles* (only if you overrule the rec) | mandatory `Api-Key` (403 without) | `https://www.opensubtitles.com/en/consumers` (register an API consumer) | free, ~20 downloads/day |

**AnimeTosho needs no key.** **Fribb/anime-lists** is a public static file (no
key). So the **minimum two keys to obtain are Jimaku + subdl** — and if you only
care about the Indonesian gap, **subdl is the one key that matters.**

---

## 6. Probe scripts (run, evidence-backed)

| Script | What it proved (run 2026-06-03) |
|---|---|
| `research-subs-jimaku.mjs` | 401 without key → key mandatory; documents AniList-search→files flow. |
| `research-subs-subdl.mjs` | 422 without key → `api_key` mandatory; with a key prints Indonesian-sub histogram. |
| `research-subs-animetosho.mjs` | 200 key-less; AniDB-keyed; extracted subs are English `.ass`. |
| `research-subs-opensubtitles.mjs` | 403 without key → `Api-Key` mandatory; documents IMDb mapping pain + 20/day cap. |

Re-run any with a real key, e.g. `JIMAKU_KEY=xxx node scripts/research-subs-jimaku.mjs`
or `SUBDL_KEY=xxx node scripts/research-subs-subdl.mjs`, to get live coverage
numbers for a chosen `ANILIST_ID` / `FILM`.
