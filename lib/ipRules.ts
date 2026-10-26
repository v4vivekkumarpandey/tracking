// Pure IP helpers (unit-tested): parsing IPs, blocklist rules (IP, CIDR or
// ASN) and recognising data-center / VPN networks by ASN.

export type ParsedIp = { v: 4 | 6; n: bigint };
export type Rule = { kind: 'asn'; asn: number } | { kind: 'net'; v: 4 | 6; base: bigint; bits: number };

export function parseIp(ip: string): ParsedIp | null {
  const s = ip.trim().toLowerCase().split('%')[0];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split('.').map(Number);
    if (p.some((x) => x > 255)) return null;
    return { v: 4, n: p.reduce((a, x) => (a << 8n) + BigInt(x), 0n) };
  }
  if (!s.includes(':')) return null;
  let t = s;
  const m = t.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/); // ::ffff:1.2.3.4
  if (m) {
    const v4 = parseIp(m[2]);
    if (!v4) return null;
    t = `${m[1]}${(v4.n >> 16n).toString(16)}:${(v4.n & 0xffffn).toString(16)}`;
  }
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const n = groups.reduce((a, g) => (a << 16n) + BigInt(parseInt(g, 16)), 0n);
  // IPv4-mapped IPv6 behaves as the IPv4 address.
  if (n >> 32n === 0xffffn) return { v: 4, n: n & 0xffffffffn };
  return { v: 6, n };
}

/**
 * "203.0.113.7", "203.0.113.0/24", "2001:db8::/32" or "AS14061". Ranges wider
 * than /8 (IPv4) or /16 (IPv6) are refused so one typo can't block everyone.
 */
export function parseRule(raw: string): { rule: Rule; text: string } | { error: string } {
  const s = raw.trim();
  const asn = s.match(/^AS(\d{1,10})$/i);
  if (asn) {
    const n = Number(asn[1]);
    if (n < 1 || n > 4_294_967_295) return { error: 'ASN out of range.' };
    return { rule: { kind: 'asn', asn: n }, text: `AS${n}` };
  }
  const [addr, len, extra] = s.split('/');
  if (extra !== undefined) return { error: 'Use an IP, a range like 203.0.113.0/24, or an ASN like AS14061.' };
  const ip = parseIp(addr ?? '');
  if (!ip) return { error: `"${s}" is not an IP address, range or ASN.` };
  const max = ip.v === 4 ? 32 : 128;
  const min = ip.v === 4 ? 8 : 16;
  const bits = len === undefined ? max : /^\d{1,3}$/.test(len) ? Number(len) : NaN;
  if (!Number.isInteger(bits) || bits < min || bits > max) return { error: `Range size must be /${min} to /${max}.` };
  const shift = BigInt(max - bits);
  return { rule: { kind: 'net', v: ip.v, base: (ip.n >> shift) << shift, bits }, text: bits === max ? addr.toLowerCase() : `${addr.toLowerCase()}/${bits}` };
}

export function ruleMatches(rule: Rule, ip: ParsedIp | null, asn: number | null): boolean {
  if (rule.kind === 'asn') return asn !== null && asn === rule.asn;
  if (!ip || ip.v !== rule.v) return false;
  const shift = BigInt((ip.v === 4 ? 32 : 128) - rule.bits);
  return (ip.n >> shift) << shift === rule.base;
}

// Networks whose users are real people even though the operator runs data
// centers: iCloud Private Relay (Akamai, Cloudflare, Fastly egress), Cloudflare
// WARP, Apple. Never treat them as hosting.
const NOT_HOSTING = new Set([13335, 209242, 20940, 16625, 36183, 54113, 714, 6185]);

const HOSTING_ASNS = new Set([
  16509, 14618, 8987, // Amazon / AWS
  15169, 396982, 19527, // Google, Google Cloud
  8075, 8068, // Microsoft / Azure
  14061, 24940, 16276, 35540, 63949, 20473, 51167, 9009, 60068, 212238, 60781, 28753, 31898, 45102, 37963,
  132203, 45090, 12876, 8560, 47583, 26496, 36352, 8100, 40676, 21859, 199524, 202422, 46606, 54290, 19318,
  46844, 53667, 35916, 62240, 22612, 397423, 136787, 207137, 147049, 32934, 396356, 62563, 174, 3214, 49981,
]);

const HOSTING_ORG = new RegExp([
  'hosting', '\\bcloud\\b', 'data ?cent(er|re)', 'datacamp', '\\bservers?\\b', '\\bvps\\b', 'colocation', '\\bcolo\\b', 'dedicated',
  'amazon', 'digitalocean', '\\bovh', 'hetzner', 'linode', 'vultr', 'choopa', 'contabo', '\\bm247', 'leaseweb', 'oracle',
  'alibaba', 'tencent', 'scaleway', 'ionos', 'godaddy', 'quadranet', 'colocrossing', 'psychz', 'zenlayer', 'g-core',
  'nforce', 'worldstream', 'hostwinds', 'interserver', 'frantech', 'packethub', 'tefincom', 'private internet access',
  'nordvpn', 'expressvpn', 'surfshark', 'mullvad', 'proton ?ag', 'cyberghost', 'windscribe', 'ipvanish', 'avast', 'kaspersky',
  'strong technology', 'clouvider', 'servers\\.com', 'cogent', 'xtom', 'ponynet', 'host ?royale', 'fdcservers',
].join('|'), 'i');

/** Data center, hosting or commercial VPN network: real shoppers rarely come from these. */
export function isDatacenter(asn: number | null, org: string): boolean {
  if (asn !== null && NOT_HOSTING.has(asn)) return false;
  if (asn !== null && HOSTING_ASNS.has(asn)) return true;
  return !!org && HOSTING_ORG.test(org);
}
