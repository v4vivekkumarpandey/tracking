import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Publishers enter postback URLs that this server then requests. Without a
// check they could point it at internal services (the database host, cloud
// metadata at 169.254.169.254, localhost admin ports): server-side request
// forgery. Every postback URL is checked when saved and again right before
// each request, since DNS can change in between.

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) ||           // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                              // multicast, reserved
  );
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind === 6) return ipv6Private(ip);
  return true;
}

/** Throws with a user-readable message if the URL may not be requested. */
export async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('URL must start with http:// or https://');
  if (u.username || u.password) throw new Error('URLs with a username or password are not allowed.');
  // Local development only (e.g. a mock endpoint on localhost). Never set in production.
  if (process.env.ALLOW_PRIVATE_POSTBACKS === 'true') return;
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('Only ports 80, 443, 8080 and 8443 are allowed.');

  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Internal hostnames are not allowed.');
  }
  // Macros like {sub1} only appear in the query; the host must be literal.
  if (/[{}]/.test(host)) throw new Error('The host part of the URL cannot contain macros.');

  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Error(`Could not resolve ${host}.`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('URLs pointing to private or internal addresses are not allowed.');
}
