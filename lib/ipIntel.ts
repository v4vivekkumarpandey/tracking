import path from 'node:path';
import maxmind, { type AsnResponse, type Reader } from 'maxmind';
import { q } from './db';
import { isDatacenter, parseIp, parseRule, ruleMatches, type Rule } from './ipRules';

// Network (ASN) of a visitor IP from the bundled DB-IP Lite ASN database
// (CC BY 4.0, https://db-ip.com; refresh with scripts/update-geoip.mjs), and
// the admin's IP blocklist.

let reader: Promise<Reader<AsnResponse> | null> | undefined;

function open() {
  return (reader ??= maxmind
    .open<AsnResponse>(path.join(process.cwd(), 'data', 'dbip-asn-lite.mmdb'))
    .catch((e) => {
      console.error('ASN database unavailable', e);
      return null;
    }));
}

export type IpInfo = { asn: number | null; org: string; datacenter: boolean };

/** Never throws; unknown networks come back as { asn: null, org: '' }. */
export async function ipInfo(ip: string): Promise<IpInfo> {
  if (!ip) return { asn: null, org: '', datacenter: false };
  try {
    const r = (await open())?.get(ip);
    const asn = r?.autonomous_system_number ?? null;
    const org = (r?.autonomous_system_organization ?? '').slice(0, 100);
    return { asn, org, datacenter: isDatacenter(asn, org) };
  } catch {
    return { asn: null, org: '', datacenter: false };
  }
}

// The blocklist is small and read on every click: keep it in memory.
const TTL_MS = 60_000;
let cache: { rules: { rule: Rule; text: string }[]; exp: number } | null = null;

async function rules() {
  if (cache && cache.exp > Date.now()) return cache.rules;
  const rows = await q<{ rule: string }>(`SELECT rule FROM ip_blocks`);
  const parsed = rows.flatMap((r) => {
    const p = parseRule(r.rule);
    return 'rule' in p ? [p] : [];
  });
  cache = { rules: parsed, exp: Date.now() + TTL_MS };
  return parsed;
}

/** The blocklist rule this visitor matches, or null. */
export async function blockedBy(ip: string, asn: number | null): Promise<string | null> {
  const list = await rules().catch(() => []);
  if (list.length === 0) return null;
  const parsed = parseIp(ip);
  return list.find((r) => ruleMatches(r.rule, parsed, asn))?.text ?? null;
}

export function clearBlockCache() {
  cache = null;
}
