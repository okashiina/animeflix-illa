import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { config } from './config.js';

// Media proxy for direct (non-HLS) files that are Referer/hotlink-gated — e.g.
// AllAnime's fast4speed CDN MP4s, which 404 without a Referer the browser can't
// set on a <video>. We forward the client's Range header (so seeking works), set
// the upstream Referer/Origin, and stream the body back (these files are large, so
// we never buffer the whole thing).
export async function handleFile(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { url, ref } = req.query as { url?: string; ref?: string };
  if (!url) {
    reply.code(400).send({ error: 'missing url' });
    return;
  }
  const referer = ref || '';
  const range = req.headers.range;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        'User-Agent': config.userAgent,
        ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
        ...(range ? { Range: range } : {}),
      },
    });
  } catch {
    reply.code(502).send({ error: 'upstream fetch failed' });
    return;
  }

  if (upstream.status >= 400 || !upstream.body) {
    reply.code(upstream.status || 502).send({ error: `upstream ${upstream.status}` });
    return;
  }

  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Accept-Ranges', 'bytes');
  for (const h of ['content-type', 'content-length', 'content-range', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) reply.header(h, v);
  }
  reply.code(upstream.status); // 200 (full) or 206 (partial, when Range was honoured)

  // Stream the web ReadableStream as a Node stream. Fastify pipes it and handles
  // client disconnects (it destroys the stream), so a viewer seeking/closing won't
  // leak the upstream connection.
  await reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
}
