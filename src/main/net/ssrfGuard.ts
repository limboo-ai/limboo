/**
 * Shared SSRF guard — the single implementation of "is this address safe to
 * connect to" used by every outbound-fetch site in the main process
 * (CLAUDE.md §6). Extracted from VoiceModelManager so the voice downloader and
 * the MCP remote-server probe classify private/loopback/link-local addresses
 * identically and can't drift.
 *
 * The core primitive is {@link makeGuardedLookup}: a `net.LookupFunction` passed
 * to `https.request({ lookup })` so the address the socket ACTUALLY connects to
 * is validated — not just a pre-check that could race (DNS rebinding). The cloud
 * metadata endpoint (169.254.169.254) is blocked unconditionally, even when a
 * caller opts into private addresses (legitimate for local MCP servers).
 */
import * as dns from 'node:dns';
import * as net from 'node:net';

/** True for any IPv4 that must never be reached from an untrusted fetch. */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a >= 224 // multicast / reserved
  );
}

/** True for any IPv4/IPv6 address that is private, loopback, or link-local. */
export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind !== 6) return true;
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') || // fc00::/7 unique-local
    lower.startsWith('fd') ||
    lower.startsWith('fe8') || // fe80::/10 link-local
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  );
}

/**
 * The cloud-provider metadata endpoint (AWS/GCP/Azure/… IMDS). Always blocked,
 * even for callers that opt into private/loopback addresses — reading instance
 * credentials is the canonical SSRF target.
 */
export function isCloudMetadataIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '169.254.169.254' ||
    lower === '::ffff:169.254.169.254' ||
    lower === 'fd00:ec2::254'
  );
}

/**
 * Build a `net.LookupFunction` that rejects a connection when the resolved
 * address is disallowed. By default private/loopback/link-local are blocked;
 * `allowPrivate` relaxes that (for user-configured local servers) but the cloud
 * metadata endpoint stays blocked regardless.
 */
export function makeGuardedLookup(opts: { allowPrivate?: boolean } = {}): net.LookupFunction {
  const allowPrivate = !!opts.allowPrivate;
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
      if (err) return callback(err, [], 4);
      const list = Array.isArray(addresses)
        ? addresses
        : [{ address: String(addresses), family: 4 }];
      const bad = list.find(
        (a) => isCloudMetadataIp(a.address) || (!allowPrivate && isPrivateIp(a.address)),
      );
      if (bad) {
        return callback(
          new Error(`Blocked: ${hostname} resolves to a disallowed address (${bad.address})`),
          [],
          4,
        );
      }
      // Match the caller's `all` expectation.
      if ((options as dns.LookupOptions).all) {
        (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      } else {
        callback(null, list[0].address, list[0].family);
      }
    });
  };
}

/**
 * Strict lookup (private + loopback + link-local + metadata all blocked). This is
 * the default posture the voice downloader relies on.
 */
export const guardedLookup: net.LookupFunction = makeGuardedLookup();

/**
 * Reject a URL unless it is https, credential-free, and on an allowlisted host.
 * Used by fixed-endpoint downloaders (voice models). MCP remote servers are
 * user-configured and use a different, per-server policy (see mcp/validate.ts).
 */
export function assertHttpsAllowlistedUrl(raw: string, allowedHosts: ReadonlySet<string>): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(`Blocked non-HTTPS URL: ${url.protocol}`);
  if (url.username || url.password) throw new Error('Blocked URL with embedded credentials');
  if (!allowedHosts.has(url.hostname)) throw new Error(`Blocked host: ${url.hostname}`);
  return url;
}
