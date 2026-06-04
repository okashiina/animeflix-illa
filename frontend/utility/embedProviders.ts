// Third-party iframe players keyed by AniList id. They load inside the user's
// browser and maintain their own source scrapers/extractors, which is far more
// durable than scraping ourselves (the previous GogoAnime approach died with
// the source site). If one provider can't find an episode, switch to another
// from the server chips — the URL formats below are easy to edit/extend.
//
// Only providers that respond AND allow being embedded (no blocking
// X-Frame-Options / CSP frame-ancestors) are listed. Ordered most-reliable
// first; the first entry is the default. Availability is PER-TITLE and changes
// over time, so the in-player switcher is the real mitigation. (vidsrc.cc was
// dropped: it sets X-Frame-Options: sameorigin and refuses to be framed.)

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
    // AniList-keyed, HiAnime-library backed. Verified frameable (CSP
    // frame-ancestors *). Most reliable in testing (played One Piece where
    // others 404'd) — default. Note: its player has no quality selector.
    id: '4animo',
    name: '4Animo',
    dub: true,
    build: (id, ep, dub) =>
      `https://cdn.4animo.xyz/api/embed/ani/${id}/${ep}/${
        dub ? 'dub' : 'sub'
      }?k=1`,
  },
  {
    // Modern, actively-maintained player, AniList-keyed, verified frameable.
    // Nice UI + quality control; auto-selects sub/dub (no flag in the URL).
    id: 'videasy',
    name: 'Videasy',
    dub: true,
    build: (id, ep) => `https://player.videasy.net/anime/${id}/${ep}`,
  },
  {
    // Has several internal servers (lamda/primesrc/sigma/alfa/...) you can
    // switch between inside its own player UI — good fallback.
    id: 'vidnest',
    name: 'Vidnest',
    dub: true,
    build: (id, ep, dub) =>
      `https://vidnest.fun/anime/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'vidlink',
    name: 'Vidlink',
    dub: true,
    build: (id, ep, dub) =>
      `https://vidlink.pro/anime/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'megaplay',
    name: 'Megaplay',
    dub: true,
    build: (id, ep, dub) =>
      `https://megaplay.buzz/stream/ani/${id}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'vidplus',
    name: 'VidPlus',
    dub: true,
    build: (id, ep, dub) =>
      `https://player.vidplus.to/embed/anime/${id}/${ep}?dub=${dub}`,
  },
];

export const defaultProviderId = embedProviders[0].id;

export const getProvider = (id: string): EmbedProvider =>
  embedProviders.find((provider) => provider.id === id) || embedProviders[0];

// ---------------------------------------------------------------------------
// Per-title memory of the embed server that last loaded for a given AniList id,
// so a returning viewer defaults straight to a server known to carry that title.
// Best-effort only: the iframe is cross-origin, so "loaded" means the provider
// page rendered — not a guarantee the exact episode resolved.
// ---------------------------------------------------------------------------

const BY_TITLE_KEY = 'kessoku.embed.byTitle';

type ByTitle = Record<number, string>;

const readByTitle = (): ByTitle => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BY_TITLE_KEY);
    return raw ? (JSON.parse(raw) as ByTitle) : {};
  } catch {
    return {};
  }
};

export const rememberProvider = (
  anilistId: number,
  providerId: string
): void => {
  if (typeof window === 'undefined' || !anilistId) return;
  try {
    const map = readByTitle();
    if (map[anilistId] === providerId) return;
    map[anilistId] = providerId;
    window.localStorage.setItem(BY_TITLE_KEY, JSON.stringify(map));
  } catch {
    /* ignore write failures (quota, blocked storage). */
  }
};

export const rememberedProvider = (anilistId: number): string | null => {
  if (!anilistId) return null;
  const id = readByTitle()[anilistId];
  // Validate against the live list so a stale/removed id falls back.
  return id && getProvider(id).id === id ? id : null;
};
