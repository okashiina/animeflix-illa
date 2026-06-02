# gogoanime-api (vendored)

This is a local, vendored replacement for the dependency that used to be
declared as `"gogoanime-api": "github:riimuru/gogoanime"`.

## Why this exists

The upstream repository `riimuru/gogoanime` was removed from GitHub through a
DMCA takedown ([github/dmca 2024-04-18](https://github.com/github/dmca/blob/master/2024/04/2024-04-18-corsearch.md)).
A DMCA takedown disables the **entire fork network**, so no GitHub fork of it
can be installed either, and the package was never published to npm under that
maintainer. As a result `yarn install --frozen-lockfile` failed with a `404`
while fetching the pinned tarball, breaking every Docker/Railway build.

This workspace package restores the exact import surface the API consumes
(`gogoanime-api/lib/anime_parser` and `gogoanime-api/lib/types`) so the build
resolves locally with no network dependency.

## Exports

- `scrapeSearch({ keyw, page? })` → `Promise<AnimeList[]>`
- `scrapeAnimeDetails({ id })` → `Promise<AnimeDetails>` (includes `episodesList`)
- `scrapeMP4({ id })` → `Promise<{ Referer, sources, sources_bk }>`

## Runtime note

GogoAnime frequently rotates and shuts down its domains. The scraper targets a
default host but every host is overridable via environment variables, and all
network paths fail soft (returning empty results) so the API route and the
build stay healthy even when the upstream site is unreachable:

| Variable | Default |
| --- | --- |
| `GOGOANIME_BASE_URL` | `https://anitaku.bz` |
| `GOGOANIME_AJAX_URL` | `https://ajax.gogocdn.net` |
| `GOGOANIME_ENC_KEY` / `GOGOANIME_ENC_IV` / `GOGOANIME_ENC_SECOND_KEY` | goload defaults |
