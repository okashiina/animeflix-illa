# AllAnime provider — source-service

Self-hosted (Option B) streaming provider that resolves an AniList episode to a
playable HLS source via AllAnime's GraphQL API. Implemented in
[`services/source-service/src/providers/allanime.ts`](../services/source-service/src/providers/allanime.ts),
following the exact `Provider` shape of `animepahe.ts`.

**Why AllAnime:** extra catalogue coverage, fresher currently-airing episodes, and
dub. (Originally hoped to be raw/soft-sub, but in practice its reliable source is a
**hard-subbed** MP4 — see §0. The raw/soft-sub ecosystem collapsed in 2026, so no
reachable provider offers clean raw video; the app's subtitle overlay still layers
Indonesian/Japanese on top, accepting the burned-in subs.)

---

## 0. UPDATE 2026-06-03 — VERIFIED WORKING END-TO-END (corrects §2–§4 below)

The provider now resolves real, seekable video on the user's machine (Dandadan ep1 →
`mode:"direct", provider:"allanime"`, a 410 MB MP4 served seekably). Getting there
needed three corrections to the original design documented further down:

1. **Episode query must use the persisted-query HASH, not the full query string.**
   Sending the full `episode{…}` query trips a server-side bug — the API returns
   `errors:[{message:"Cannot set property 'countryOfOrigin' of undefined"}]` and an
   encrypted decoy. Instead send Apollo APQ extensions:
   `?variables=…&extensions={"persistedQuery":{"version":1,"sha256Hash":"d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec"}}`
   (hash from current ani-cli; overridable via `ALLANIME_EPISODE_HASH`). Search still
   uses the full query and works fine.

2. **The episode payload is AES-256-CTR-encrypted in `data.tobeparsed`.** `sourceUrls`
   is no longer plaintext. Decrypt mirroring ani-cli's `process_response`:
   - key = `SHA256("Xot36i3lK3:v1")` (32 bytes)
   - base64-decode `tobeparsed`; IV = bytes `[1..13]` (12 bytes); CTR counter = `IV ++ 00000002`
   - ciphertext = bytes `[13 .. len-16]` (trailing 16 bytes discarded); no padding
   - decrypted text is `{"episode":{"sourceUrls":[…]}}` (plaintext again).

3. **Referer/Origin = `https://youtu-chan.com`** (not `allanime.to`). The CF clearance
   cookie + FlareSolverr UA still clear Cloudflare; the youtu-chan referer is what the
   API gate expects.

**Source reality:** for current titles the internal `/clock.json` providers (Luf-Mp4,
S-mp4) frequently 500 / return link-less responses. The one that consistently works is
AllAnime's own CDN, decoded directly in `sourceUrls` as a **direct MP4** on
`tools.fast4speed.rsvp/...?Authorization=…`. It is **Referer-gated** (404 without
`Referer: youtu-chan.com`) and browsers can't set a Referer on a `<video>`, so it is
served through a new **`/file` proxy** (`src/fileProxy.ts`) that sets the Referer and
forwards `Range` (verified: HTTP 206 + `Content-Range`, seek to byte 100 M works).
Embed-page links (ok.ru, mp4upload) are filtered out — they're HTML players, not
streams. Because the source is a non-HLS MP4, the frontend player
(`HlsPlayer.tsx`) was given a native-`<video src>` path for non-HLS sources (hls.js
only handles m3u8).

**Verified live:** CF clearance → search → persisted-query episode (200, no error) →
AES decrypt (`{"episode":{"sourceUrls":[…]}}`) → fast4speed MP4 → `/file` 206 seekable.
**Not browser-verified:** on-screen playback of the proxied MP4 (the player's native
path is wired + typechecks, but needs a real browser to confirm it renders).

**Trade-offs:** AllAnime CF-solves on each cold resolve (~45 s, then cached 15 min) and
streams a full ~400 MB MP4 through the container (no adaptive bitrate). Despite that it
is now the **primary** (`PROVIDERS=allanime,animepahe`) by user preference (2026-06-05) —
best picture + freshest airing/dub coverage — with AnimePahe (HLS, fast, lighter) as the
automatic fallback when AllAnime can't resolve a title. Swap back to `animepahe,allanime`
for the faster cold-start default.

---

## 1. Reachability from Indonesia (CRITICAL FINDING)

Tested locally on this machine, 2026-06. The user's ISP blocks some hosts via SNI/DPI
(confirmed dead: `hianime.to`, `megacloud.blog`, `9animetv.to`, `kaido.to`).

| Host | Result | Interpretation |
|---|---|---|
| `api.allanime.day` | **HTTP 403** ("Just a moment…" Cloudflare page) | **Reachable.** The TLS handshake completed and Cloudflare's edge answered — this is a solvable bot-challenge, NOT an SNI/DPI block. |
| `allmanga.to` | **HTTP 200** | Fully reachable, no challenge. |
| `allanime.day` (apex) | DNS resolves to Cloudflare IPs (`172.67.70.99`, `104.26.10.39/11.39`); one ad-hoc `fetch` timed out once but DNS + IPs are live. | Same Cloudflare anycast as the API; treat as reachable-but-CF-gated. |
| `allanime.to` | connect timeout | This specific vanity host looks dead/migrated; we do **not** depend on it (it's only used as a `Referer` string, never actually fetched). |
| `hianime.to` / `megacloud.blog` (controls) | HTTP 522 | Edge answered but origin unreachable — different failure than a hard SNI block, but these remain unusable for streams. |

**Conclusion:** AllAnime's API is reachable from the user's network. The only barrier
is Cloudflare's JS/bot challenge on `api.allanime.day` and `allanime.day`, which is
**exactly what FlareSolverr is for**. This is fundamentally different from the
hianime/megacloud SNI-block situation. The provider therefore mints a `cf_clearance`
cookie via FlareSolverr and reuses it — the proven pattern from
`scripts/probe-allanime-solver.mjs`.

**Verified live:** that `api.allanime.day` returns a Cloudflare 403 (reachable), that
`allmanga.to` returns 200, and that the hosts' DNS resolves to Cloudflare IPs.
**Not verified live** (FlareSolverr/Docker was not run in this session): the
end-to-end mint→search→episode→clock.json→m3u8 flow. The decode and API shapes are
cross-checked against three independent, current implementations (ani-cli, animdl,
and the repo's own working probe script), so the logic is high-confidence, but a real
run behind FlareSolverr on the user's box is the final confirmation.

---

## 2. API shape

GraphQL-over-GET. Base: `https://api.allanime.day/api`. The query + JSON variables are
passed as URL query params (`?variables=...&query=...`). Gated on `Referer`/`Origin`
(the code uses `https://allanime.to/` / origin `https://allanime.to`; ani-cli uses
`https://youtu-chan.com` — both are accepted).

### Search

```graphql
query( $search: SearchInput $limit: Int $page: Int
       $translationType: VaildTranslationTypeEnumType
       $countryOrigin: VaildCountryOriginEnumType ) {
  shows( search: $search limit: $limit page: $page
         translationType: $translationType countryOrigin: $countryOrigin ) {
    edges { _id name availableEpisodes __typename }
  }
}
```
Variables: `{ search: { allowAdult:false, allowUnknown:false, query }, limit:40, page:1, translationType:"sub"|"dub", countryOrigin:"ALL" }`.
Returns `data.shows.edges[] = { _id, name, availableEpisodes:{ sub, dub } }`.

> Note the upstream typo `Vaild…` in the enum names — it is required as-is.

### Episode sources

```graphql
query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
  episode( showId: $showId translationType: $translationType episodeString: $episodeString ) {
    episodeString sourceUrls
  }
}
```
Returns `data.episode.sourceUrls[] = { sourceUrl, sourceName, type, className, priority }`.
`sourceUrl` is **obfuscated** (see §3). `priority` ranks providers (higher = better;
the internal "Default"/"Luf-Mp4"/"wixmp" embeds resolve to HLS via `/clock.json`).

(There is also a `show(_id){ availableEpisodesDetail }` query used by ani-cli to list
all episode numbers. We don't need it: AniList gives us the episode number directly,
so we query the episode by string and skip the listing round-trip.)

---

## 3. Decode method (sourceUrl → path)

Each `sourceUrl` that begins with `-` / `--` is a hex string where **every byte is
XOR-ed with `56` (0x38)**. Strip the leading dashes, take hex pairs, XOR each:

```
"-79557a59" -> bytes 0x79 0x55 0x7a 0x59 -> ^0x38 -> 0x41 0x6d 0x42 0x61 -> "AmBa"
```

This single-byte XOR is **byte-for-byte equivalent** to ani-cli's long `sed`
substitution table (e.g. `79->A`, `59->a`, `08->0`, `02->:`, `17->/`, `16->.`,
`46->~`). Confirmed against ani-cli, animdl (`one_digit_symmetric_xor(56, …)`), and
the repo probe. Decoded values look like `/apivtwo/clock?id=…`.

### clock → clock.json

For internal embeds the decoded path contains `/clock?…`. Replace `/clock?` with
`/clock.json?` and GET it from the resolver host (`https://allanime.day` by default;
AllAnime's `getVersion.episodeIframeHead` reports this host). The response:

```jsonc
{
  "links": [
    {
      "link": "https://….m3u8",      // or "src"
      "hls": true,                    // HLS master playlist
      "resolutionStr": "1080",        // quality label
      "mp4": false,
      "subtitles": [                  // optional soft-subs on this variant
        { "lang": "en-US", "label": "English", "src": "https://….vtt" }
      ]
    }
  ],
  "subtitles": [ /* optional top-level soft-subs */ ]
}
```

The provider keeps `link.link || link.src`, marks it `isM3U8` when `hls===true` or the
URL ends `.m3u8`, sorts HLS first, and attaches every `subtitles[].src` it finds. It
re-mints FlareSolverr clearance once if the clock host itself returns 403.

---

## 4. Softsub vs hardsub vs raw, and sub/dub

- **`translationType: "sub"`** = Japanese audio. AllAnime's internal sources are
  typically **RAW or soft-subbed** (subs are separate `.vtt` tracks in `clock.json`,
  not burned into the frame) — the opposite of AnimePahe's hard-subs. This is the
  whole reason to add it.
- **`translationType: "dub"`** = English audio (mapped from `params.category==='dub'`).
- **Soft-subs**: when present they're returned as `subtitles[]` and flow straight into
  the `/watch` response's `subtitles` array, so the player can render them. They are
  often (not always) English; the app's external subtitle pipeline (subdl/Jimaku) is
  still the primary path for Indonesian/Japanese.
- Whether a given title is truly raw vs. carries an embedded English softsub varies
  per upload; the code surfaces whatever AllAnime returns and never assumes.

---

## 5. EXACT wiring instructions (apply yourself — I did NOT edit these files)

The provider already conforms to the registry and config, so wiring is essentially
**already done** — these are the touch-points to confirm/leave as-is:

1. **`src/providers/index.ts`** — already imports and registers it:
   ```ts
   import { allanime } from './allanime.js';
   const registry: Record<string, Provider> = {
     [allanime.id]: allanime,   // ✅ present
     [animepahe.id]: animepahe,
   };
   ```
   No change needed.

2. **`src/config.ts`** — provider order already includes it; AllAnime is first so it's
   tried before AnimePahe (good: raw/softsub preferred over hard-sub):
   ```ts
   providers: (process.env.PROVIDERS || 'allanime,animepahe')…  // ✅ present
   ```
   No change needed. To disable temporarily, set env `PROVIDERS=animepahe`.

3. **`src/resolver.ts` / `src/server.ts`** — **no change needed.** The resolver loops
   `orderedProviders` generically and `/watch` already maps `result.sources` through
   `/hls` (using each source's `headers.Referer`) and merges `result.subtitles`. Since
   AllAnime returns `{ sources:[{url,quality,isM3U8,headers:{Referer}}], subtitles:[{url,lang,label}] }`,
   it drops straight in.

4. **Env vars (optional overrides)** — all have safe defaults baked in:
   | Var | Default | Purpose |
   |---|---|---|
   | `ALLANIME_API` | `https://api.allanime.day/api` | GraphQL endpoint |
   | `ALLANIME_CLOCK_HOST` | `https://allanime.day` | host serving `/clock.json` |
   | `ALLANIME_REFERER` | `https://allanime.to/` | Referer/Origin for the API (try `https://youtu-chan.com/` if the API tightens) |
   | `FLARESOLVERR_URL` | `http://flaresolverr:8191/v1` | from `config.flaresolverrUrl` |

   **Requirement:** FlareSolverr must be running and reachable (same as AnimePahe).

### How to verify live (on the user's machine)

```bash
# 1) FlareSolverr up
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest

# 2) Smoke-test the raw pipeline (already in repo)
cd services/source-service
node scripts/probe-allanime-solver.mjs "Dandadan" 1 sub
#   -> should print search results, decoded sourceUrls, and "RESULT: N playable links"

# 3) End-to-end through the service
#    start the service (FLARESOLVERR_URL pointing at the container), then:
#    GET /watch?anilistId=<id>&episode=1&category=sub&titles=Dandadan
#    -> expect { mode:"direct", provider:"allanime", sources:[…m3u8 via /hls…], subtitles:[…] }
```

If `api.allanime.day` ever returns results without a Cloudflare challenge (it
sometimes does for fresh IPs), the `fsSolve` cookie is simply empty and the plain
`fetch` still works — the code handles both.

---

## 6. References (current as of 2026-06)

- `services/source-service/scripts/probe-allanime-solver.mjs` — the repo's own working
  probe; the provider is a structured port of it.
- ani-cli (`pystardust/ani-cli`) — canonical decode table + GraphQL queries.
- animdl (`justfoolingaround/animdl`) — confirms XOR-56, `clock.json`, and that
  `clock.json` carries `links` + `subtitles` + `rawUrls`.
