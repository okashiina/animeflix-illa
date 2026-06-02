// Third-party iframe players keyed by AniList id. They load inside the user's
// browser and maintain their own source scrapers/extractors, which is far more
// durable than scraping ourselves (the previous GogoAnime approach died with
// the source site). If one provider can't find an episode, switch to another
// from the player dropdown — the URL formats below are easy to edit/extend.
//
// Only providers that respond AND allow being embedded (no blocking
// X-Frame-Options / CSP frame-ancestors) are listed. Ordered most-reliable
// first; the first entry is the default. (vidsrc.cc was dropped: it sets
// `X-Frame-Options: sameorigin` and refuses to be framed.)

export interface EmbedProvider {
  id: string;
  name: string;
  /** Whether the provider serves a dub track. */
  dub: boolean;
  /** Build the embed URL from an AniList id, episode number and dub flag. */
  build: (anilistId: number, episode: number, dub: boolean) => string;
}

export const embedProviders: EmbedProvider[] = [
  {
    // Modern, actively-maintained player, AniList-keyed, verified frameable
    // (no X-Frame-Options / CSP frame-ancestors as of 2026-06). Auto-selects
    // sub/dub, so the dub flag is not part of the URL.
    id: 'videasy',
    name: 'Videasy',
    dub: true,
    build: (id, ep) => `https://player.videasy.net/anime/${id}/${ep}`,
  },
  {
    // Has several internal servers (lamda/primesrc/sigma/alfa/...) you can
    // switch between inside its own player UI — good last-line fallback.
    id: 'vidnest',
    name: 'Vidnest',
    dub: true,
    build: (id, ep, dub) =>
      `https://vidnest.fun/anime/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'vidplus',
    name: 'VidPlus',
    dub: true,
    build: (id, ep, dub) =>
      `https://player.vidplus.to/embed/anime/${id}/${ep}?dub=${dub}`,
  },
  {
    id: 'megaplay',
    name: 'Megaplay',
    dub: true,
    build: (id, ep, dub) =>
      `https://megaplay.buzz/stream/ani/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'vidlink',
    name: 'Vidlink',
    dub: true,
    build: (id, ep, dub) =>
      `https://vidlink.pro/anime/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    // AniList-keyed, HiAnime-library backed. Verified frameable: the embed host
    // cdn.4animo.xyz sends `Content-Security-Policy: ... frame-ancestors *`.
    id: '4animo',
    name: '4Animo',
    dub: true,
    build: (id, ep, dub) =>
      `https://cdn.4animo.xyz/api/embed/ani/${id}/${ep}/${
        dub ? 'dub' : 'sub'
      }?k=1`,
  },
  {
    // AniList-keyed. Reported frameable but not fully verified — last-resort.
    id: 'nhdapi',
    name: 'NHDAPI',
    dub: true,
    build: (id, ep, dub) =>
      `https://nhdapi.xyz/anime/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
];

export const defaultProviderId = embedProviders[0].id;

export const getProvider = (id: string): EmbedProvider =>
  embedProviders.find((provider) => provider.id === id) || embedProviders[0];
