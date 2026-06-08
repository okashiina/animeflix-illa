import { NextApiRequest, NextApiResponse } from 'next';

import { isFetchUrlSafe } from '@utility/ssrfGuard';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { src: rawSrc, referer: rawReferer } = req.query;

  // Query values arrive as string | string[] | undefined; collapse to one string.
  // An if-chain (not a nested ternary) keeps the lint config happy.
  const firstParam = (v: string | string[] | undefined, sep = ''): string => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.join(sep);
    return '';
  };

  // A missing or empty src used to crash on undefined.join(...); now it is a clean
  // 400 instead of a 500.
  const src = firstParam(rawSrc);
  if (!src) {
    res.status(400).json({ error: 'missing src' });
    return;
  }

  // Referer is optional, so default to an empty string rather than 400 on absence.
  const referer = firstParam(rawReferer, ' ');

  // SSRF guard: only fetch public http/https targets. This blocks loopback,
  // link-local (incl. cloud metadata), and private/internal addresses while still
  // allowing every legitimate public streaming CDN.
  if (!(await isFetchUrlSafe(src))) {
    res.status(400).json({ error: 'invalid src' });
    return;
  }

  const options = {
    headers: {
      Referer: referer,
    },
  };

  // fetch the data from the url
  let response: Response;
  try {
    response = await fetch(src, options);
  } catch {
    // A dead or unreachable upstream should not crash the route.
    res.status(502).json({ error: 'upstream' });
    return;
  }

  // Copy a response header through, but only when the upstream actually sent it:
  // res.setHeader throws on a null value.
  const setHeader = (header: string) => {
    const value = response.headers.get(header.toLowerCase());
    if (value !== null) res.setHeader(header, value);
  };

  // set etag, and expires header so that the browser caches the video data
  setHeader('etag');
  setHeader('expires');

  // send the response data back to the client
  res.send(response.body);
}
