// Central config, all from env with safe defaults. Config-as-data (SOP #7):
// providers / proxy / TTLs / breaker tuning are swappable without code changes.

const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8080),
  providers: (process.env.PROVIDERS || 'allanime,animepahe')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  flaresolverrUrl: process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1',
  proxyUrl: process.env.PROXY_URL || '',
  sourceTtlMs: num(process.env.SOURCE_TTL_MS, 15 * 60 * 1000),
  subtitleTtlMs: num(process.env.SUBTITLE_TTL_MS, 24 * 60 * 60 * 1000),
  breakerThreshold: num(process.env.BREAKER_THRESHOLD, 4),
  breakerCooldownMs: num(process.env.BREAKER_COOLDOWN_MS, 2 * 60 * 1000),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  openSubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY || '',
  // External subtitle sources (Phase 3). See docs/SUBTITLE-SOURCING-RESEARCH.md.
  subdlApiKey: process.env.SUBDL_API_KEY || '', // Indonesian (id)
  jimakuApiKey: process.env.JIMAKU_API_KEY || '', // Japanese (ja)
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
} as const;
