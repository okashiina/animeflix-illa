export type Category = 'sub' | 'dub';

export interface Source {
  url: string; // m3u8 (HLS) or mp4
  quality?: string; // e.g. "1080", "720", "auto"
  isM3U8?: boolean;
  headers?: Record<string, string>; // Referer/Origin needed to fetch it
}

export interface Subtitle {
  url: string;
  lang: string; // ISO code, e.g. "en", "id"
  label?: string;
}

export interface ResolveResult {
  provider: string;
  sources: Source[];
  subtitles: Subtitle[];
  headers?: Record<string, string>; // default headers for the HLS proxy
}

export interface WatchParams {
  anilistId: number;
  episode: number;
  category: Category;
  titles: string[]; // candidate titles (english/romaji) for providers that search by name
}

// Every source provider implements this. The resolver treats them uniformly and
// never depends on a single one (SOP #1). Real extractor logic is added in Phase 1
// using /playwright-cli + /web-scraping, and validated against the live site.
export interface Provider {
  id: string;
  /** Resolve playable sources for one episode, or null if this provider can't. */
  resolve(params: WatchParams): Promise<ResolveResult | null>;
}
