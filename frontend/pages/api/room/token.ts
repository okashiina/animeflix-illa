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

  // Bind the token to the single room channel the client is joining, so a token
  // can't be replayed against other rooms. The code shape mirrors
  // `normalizeRoomCode` (uppercased [A-Z0-9], max 12). A real client always
  // sends a valid `room`; the no-capability fallback below is just safety so the
  // probe/legacy paths never regress.
  const roomRaw = req.query.room;
  const room = typeof roomRaw === 'string' ? roomRaw : '';
  const validRoom = /^[A-Z0-9]{1,12}$/i.test(room);

  try {
    const rest = new Ably.Rest({ key: ABLY_KEY });
    // NOTE: the `kessoku:room:` prefix is hardcoded here and MUST stay in sync
    // with `CHANNEL_PREFIX` in `utility/realtime.ts`.
    const tokenParams: Ably.TokenParams = validRoom
      ? {
          clientId,
          capability: JSON.stringify({
            [`kessoku:room:${room}`]: ['subscribe', 'publish', 'presence'],
          }),
        }
      : { clientId };
    const tokenRequest = await rest.auth.createTokenRequest(tokenParams);
    res.status(200).json(tokenRequest);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[room] token mint failed', err);
    res.status(500).json({ error: 'token_failed' });
  }
};

export default handler;
