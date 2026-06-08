import dns from 'node:dns/promises';
import net from 'node:net';

// SSRF guard for the video proxy. The proxy fetches HLS playlists, segments, and
// subtitle files from many third-party public CDNs that change constantly, so we
// cannot use a static host allowlist without breaking playback. Instead we allow
// any public http/https URL and block only targets that point inward: loopback,
// link-local (incl. the 169.254.169.254 cloud-metadata endpoint), private ranges,
// CGNAT/Tailscale space, and the IPv6 equivalents. Every legitimate streaming host
// is publicly routable, so this kills the SSRF/open-proxy vector while preserving
// every feature. Runs in the Node runtime, where node:dns and node:net exist.

// Returns true when an IPv4 address is private/loopback/link-local/reserved and so
// must be blocked. We parse the dotted octets ourselves rather than trust the host
// string, because DNS can resolve a public-looking name to an internal address.
function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);

  return (
    a === 0 || // 0.0.0.0/8 "this network"
    a === 10 || // 10/8 private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, includes 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12 private
    (a === 192 && b === 168) || // 192.168/16 private
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT / Tailscale
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 IETF protocol assignments
    a >= 224 // 224/4 multicast + 240/4 reserved
  );
}

// Returns true when an IPv6 address is private/loopback/link-local and so must be
// blocked. The address is already bracket-free (it comes from URL.hostname). We
// also unwrap v4-mapped addresses (::ffff:a.b.c.d) and defer to the v4 check, since
// those reach the same internal IPv4 target.
function isPrivateV6(ip: string): boolean {
  const addr = ip.toLowerCase();

  if (addr === '::1' || addr === '::') return true; // loopback / unspecified

  // v4-mapped (::ffff:169.254.169.254 etc.): block based on the embedded IPv4.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);

  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/i.test(addr)) return true; // fe80::/10 link-local
  if (addr.startsWith('fec0')) return true; // deprecated site-local

  return false;
}

// Decides whether the proxy may fetch the given URL. Async because resolving a
// hostname to its actual addresses is the only way to catch DNS that points at an
// internal IP. Any parse/protocol/resolution problem fails closed (returns false).
export async function isFetchUrlSafe(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false; // not a valid absolute URL
  }

  // Only plain web fetches. This blocks file:, gopher:, data:, ftp:, etc.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  // URL.hostname strips IPv6 brackets, so a literal IP lands here bare.
  const host = u.hostname;

  const kind = net.isIP(host);
  if (kind === 4) return !isPrivateV4(host);
  if (kind === 6) return !isPrivateV6(host);

  // It is a hostname, not a literal IP. Reject the obvious internal names up front.
  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return false;
  }

  // Resolve and require EVERY address to be public, so a name that maps to any
  // internal IP (DNS rebinding, split-horizon tricks) is rejected.
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    return false; // resolution failed, fail closed
  }
  if (records.length === 0) return false;

  return records.every(({ address, family }) =>
    family === 4 ? !isPrivateV4(address) : !isPrivateV6(address)
  );
}
