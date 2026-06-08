import dns from 'node:dns/promises';
import net from 'node:net';

// SSRF guard for /hls and /file. Unlike /subs (a static host allowlist), these
// proxy playlists/segments/MP4s from many public CDNs that change constantly, so
// a fixed allowlist would break playback. Instead we allow ANY public http/https
// target and block only private/loopback/link-local/internal ones — every real
// streaming host is public, so this kills the open-proxy/SSRF without touching
// legit streams. (FlareSolverr is reached via config.flaresolverrUrl in
// fetcher.ts, not through these handlers, so it is unaffected.)

// True if an IPv4 literal points at a non-public range we must never fetch.
function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

// True if an IPv6 literal points at a non-public range. Handles IPv4-mapped
// addresses (::ffff:a.b.c.d) by deferring to the v4 check on the trailing dotted
// quad, since those resolve to the embedded IPv4 destination.
function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true; // loopback / unspecified
  const mapped = v.indexOf('::ffff:');
  if (mapped !== -1 && v.includes('.')) {
    const v4 = v.slice(v.lastIndexOf(':') + 1);
    return isPrivateV4(v4);
  }
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/i.test(v)) return true; // fe80::/10 link-local
  if (v.startsWith('fec0')) return true; // fec0::/10 deprecated site-local
  return false;
}

// True only if the URL is a public http/https target safe to fetch. For
// hostnames we resolve via DNS and require EVERY answer to be public, so a name
// that maps to a private IP (DNS rebinding / internal name) is rejected too.
export async function isFetchUrlSafe(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname; // URL strips the brackets from IPv6 literals
  const kind = net.isIP(host);
  if (kind === 4) return !isPrivateV4(host);
  if (kind === 6) return !isPrivateV6(host);

  // Hostname (not an IP literal). Reject names that resolve to the host itself
  // or an internal zone outright, then resolve and require all answers public.
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return false;
  }

  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return false;
  }
  if (addrs.length === 0) return false;

  return addrs.every((a) =>
    a.family === 6 ? !isPrivateV6(a.address) : !isPrivateV4(a.address)
  );
}
