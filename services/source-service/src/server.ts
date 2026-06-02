import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { resolve } from './resolver.js';
import { handleHls } from './hlsProxy.js';
import { snapshot } from './circuitBreaker.js';
import { orderedProviders } from './providers/index.js';
import type { Category } from './types.js';

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
});

const startedAt = Date.now();

app.get('/health', async () => ({ ok: true }));

// Observability (SOP #9) + per-provider breaker state (SOP #4 status surface).
app.get('/status', async () => ({
  ok: true,
  uptimeMs: Date.now() - startedAt,
  providers: orderedProviders.map((p) => p.id),
  breakers: snapshot(),
}));

// Main endpoint the frontend calls. Returns either a directly-playable result
// (sources proxied through /hls) or { mode: 'embed' } so the frontend uses its
// existing embed switcher as the fallback (SOP #2).
app.get('/watch', async (req) => {
  const q = req.query as Record<string, string>;
  const anilistId = Number(q.anilistId);
  const episode = Number(q.episode);
  const category: Category = q.category === 'dub' ? 'dub' : 'sub';
  const titles = (q.titles || '').split(',').map((t) => t.trim()).filter(Boolean);

  if (!anilistId || !episode) {
    return { mode: 'embed', reason: 'missing anilistId/episode' };
  }

  const result = await resolve({ anilistId, episode, category, titles });
  if (!result) return { mode: 'embed' };

  // Rewrite each source through our HLS proxy so the browser can play it.
  const base = `${req.protocol}://${req.headers.host}`;
  const sources = result.sources.map((s) => {
    const ref = s.headers?.Referer || result.headers?.Referer || '';
    const proxied = s.isM3U8
      ? `${base}/hls?url=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(ref)}`
      : s.url;
    return { ...s, url: proxied };
  });

  return { mode: 'direct', provider: result.provider, sources, subtitles: result.subtitles };
});

app.get('/hls', handleHls);

// Subtitles (Phase 3): OpenSubtitles (id/en) -> VTT, served from our domain.
app.get('/subs', async (req, reply) => {
  reply.code(501).send({ error: 'subtitles not implemented yet (Phase 3)' });
});

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then((addr) => app.log.info(`source-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
