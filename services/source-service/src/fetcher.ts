import { config } from './config.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOpts {
  headers?: Record<string, string>;
  // Route through FlareSolverr to solve Cloudflare/JS challenges. Slower; use only
  // for hosts that actually challenge (SOP #8: bounded retries + backoff).
  solver?: boolean;
  retries?: number;
  timeoutMs?: number;
}

async function direct(url: string, opts: FetchOpts): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.userAgent, ...opts.headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function viaSolver(url: string, opts: FetchOpts): Promise<string> {
  const body: Record<string, unknown> = {
    cmd: 'request.get',
    url,
    maxTimeout: opts.timeoutMs ?? 60000,
  };
  if (config.proxyUrl) body.proxy = { url: config.proxyUrl };
  const res = await fetch(config.flaresolverrUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status: string;
    solution?: { response: string };
    message?: string;
  };
  if (json.status !== 'ok' || !json.solution) {
    throw new Error(`flaresolverr: ${json.message || json.status}`);
  }
  return json.solution.response;
}

/** GET text with retry + exponential backoff; optionally through FlareSolverr. */
export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return opts.solver ? await viaSolver(url, opts) : await direct(url, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s…
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}
