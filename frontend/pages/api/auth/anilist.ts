import type { NextApiRequest, NextApiResponse } from 'next';

// Server-side AniList token exchange. The browser sends the authorization `code`
// from the OAuth redirect; we swap it for an access token using the client
// secret (server-only env var — never exposed to the client). Only the access
// token + lifetime are returned. AniList tokens last ~1 year, so we ignore the
// refresh token.

const TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { code, redirectUri } = (req.body ?? {}) as {
    code?: string;
    redirectUri?: string;
  };
  const clientId = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;
  const clientSecret = process.env.ANILIST_CLIENT_SECRET;

  if (!code || !redirectUri || !clientId || !clientSecret) {
    res.status(400).json({ error: 'missing_params_or_config' });
    return;
  }

  try {
    const anilist = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    const data = (await anilist.json()) as TokenResponse;
    if (!anilist.ok || !data.access_token) {
      res.status(400).json({ error: 'exchange_failed' });
      return;
    }

    res
      .status(200)
      .json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
