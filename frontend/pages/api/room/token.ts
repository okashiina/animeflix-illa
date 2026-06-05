import { randomUUID } from 'crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

import * as Ably from 'ably';

// Token endpoint for Teleparty co-watch rooms. The browser never sees the Ably
// key: it asks here, we mint a short-lived token bound to the caller's clientId,
// and the Ably client authenticates with that. `?probe=1` is a cheap "are rooms
// even configured?" check the UI uses to show the feature or a setup note.
// Needs a free ABLY_API_KEY (server-only Railway var); absent → 503, rooms hide.

const ABLY_KEY = process.env.ABLY_API_KEY || '';

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.query.probe === '1') {
    res.status(200).json({ configured: Boolean(ABLY_KEY) });
    return;
  }
  if (!ABLY_KEY) {
    res.status(503).json({ error: 'room_unconfigured' });
    return;
  }

  const raw = req.query.clientId;
  const clientId =
    (typeof raw === 'string' && raw.trim().slice(0, 64)) ||
    `guest-${randomUUID()}`;

  try {
    const rest = new Ably.Rest({ key: ABLY_KEY });
    const tokenRequest = await rest.auth.createTokenRequest({ clientId });
    res.status(200).json(tokenRequest);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[room] token mint failed', err);
    res.status(500).json({ error: 'token_failed' });
  }
};

export default handler;
