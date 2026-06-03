import { config } from './config.js';

// Thin FlareSolverr client. Sessions keep a warmed browser context (correct TLS
// fingerprint + anti-bot clearance) alive across requests — required for
// DDoS-Guard hosts like AnimePahe, where cookie-reuse with a plain fetch fails.

interface FsSolution {
  url: string;
  status: number;
  response: string;
  cookies: { name: string; value: string }[];
  userAgent: string;
}
interface FsResp {
  status: string;
  message?: string;
  session?: string;
  solution?: FsSolution;
}

async function fsPost(body: Record<string, unknown>): Promise<FsResp> {
  const res = await fetch(config.flaresolverrUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as FsResp;
}

export async function createSession(): Promise<string> {
  const r = await fsPost({ cmd: 'sessions.create' });
  if (r.status !== 'ok' || !r.session) {
    throw new Error(`flaresolverr session.create: ${r.message || r.status}`);
  }
  return r.session;
}

export async function destroySession(session: string): Promise<void> {
  await fsPost({ cmd: 'sessions.destroy', session }).catch(() => {});
}

/** GET a URL through a FlareSolverr session; returns the rendered response text. */
export async function sessionGet(
  session: string,
  url: string,
  maxTimeout = 60000
): Promise<{ status: number; response: string }> {
  const r = await fsPost({ cmd: 'request.get', session, url, maxTimeout });
  if (r.status !== 'ok' || !r.solution) {
    throw new Error(`flaresolverr request.get: ${r.message || r.status}`);
  }
  return { status: r.solution.status, response: r.solution.response };
}
