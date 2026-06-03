import { NextApiRequest, NextApiResponse } from 'next';

import { getFillerEpisodes, FillerKind } from '@animeflix/api';

/**
 * Episode filler/canon classification, keyed by episode number.
 *
 * Fetched client-side (not in the watch page's SSR) so a slow third-party
 * scrape can never block playback. getFillerEpisodes never throws and returns
 * an empty map on any failure, so the worst case here is `{}`.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { title, alt } = req.query;

  const primary = typeof title === 'string' ? title : '';
  const fallback = typeof alt === 'string' ? alt : '';

  let map = await getFillerEpisodes(primary);
  if (map.size === 0 && fallback && fallback !== primary) {
    map = await getFillerEpisodes(fallback);
  }

  const byEpisode: Record<number, FillerKind> = Object.fromEntries(map);

  // Static-ish data — let the browser/CDN cache it for a day.
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=604800'
  );
  res.json(byEpisode);
}
