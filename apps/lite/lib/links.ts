import { q } from './db';
import type { Rules } from './routing';

export type Link = {
  id: number;
  code: string;
  offerId: number;
  publisherId: number;
  advertiserId: number;
  destination: string;
  /** False if the link, offer or publisher is paused, or access was revoked. */
  active: boolean;
  deeplinkEnabled: boolean;
  deeplinkParam: string;
  rules: Rules;
  fallbackOfferId: number | null;
  fallbackUrl: string | null;
};

// In-process cache so most clicks skip the database lookup. Status changes
// in the dashboard reach clicks within TTL (or at once, via clearLinkCache).
const TTL_MS = 60_000;
const cache = new Map<string, { link: Link | null; exp: number }>();

const LINK_SQL = `
SELECT l.id, l.code, l.offer_id, l.publisher_id, o.advertiser_id, o.destination_url, o.deeplink_enabled, o.deeplink_param,
       o.countries, o.devices, o.daily_cap, o.monthly_cap, o.daily_budget, o.fallback_offer_id, o.fallback_url,
       (l.status = 'active' AND o.status = 'active' AND p.status = 'active'
        AND COALESCE(a.status, '') = 'approved') AS active
FROM tracking_links l
JOIN offers o     ON o.id = l.offer_id
JOIN publishers p ON p.id = l.publisher_id
LEFT JOIN publisher_offer_access a ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id`;

type Row = {
  id: number; code: string; offer_id: number; publisher_id: number; advertiser_id: number; destination_url: string;
  deeplink_enabled: number; deeplink_param: string; countries: string | null; devices: string | null;
  daily_cap: number | null; monthly_cap: number | null; daily_budget: string | null;
  fallback_offer_id: number | null; fallback_url: string | null; active: number;
};

function toLink(r: Row): Link {
  return {
    id: Number(r.id), code: r.code, offerId: Number(r.offer_id), publisherId: Number(r.publisher_id),
    advertiserId: Number(r.advertiser_id), destination: r.destination_url, active: Number(r.active) === 1,
    deeplinkEnabled: Number(r.deeplink_enabled) === 1, deeplinkParam: r.deeplink_param || 'click_id',
    rules: {
      countries: r.countries, devices: r.devices,
      daily_cap: r.daily_cap === null ? null : Number(r.daily_cap),
      monthly_cap: r.monthly_cap === null ? null : Number(r.monthly_cap),
      daily_budget: r.daily_budget === null ? null : Number(r.daily_budget),
    },
    fallbackOfferId: r.fallback_offer_id === null ? null : Number(r.fallback_offer_id),
    fallbackUrl: r.fallback_url || null,
  };
}

export async function getLink(code: string): Promise<Link | null> {
  const hit = cache.get(code);
  if (hit && hit.exp > Date.now()) return hit.link;
  const [r] = await q<Row>(`${LINK_SQL} WHERE l.code = ?`, [code]);
  const link = r ? toLink(r) : null;
  if (cache.size > 10_000) cache.clear();
  // Unknown codes are cached briefly too, so junk traffic can't hammer MySQL.
  cache.set(code, { link, exp: Date.now() + (link ? TTL_MS : 10_000) });
  return link;
}

/** A publisher's link for an offer (used for fallbacks and smart links). */
export async function linkFor(publisherId: number, offerId: number): Promise<Link | null> {
  const [r] = await q<{ code: string }>(
    `SELECT code FROM tracking_links WHERE publisher_id = ? AND offer_id = ? AND status = 'active' LIMIT 1`, [publisherId, offerId],
  );
  return r ? getLink(r.code) : null;
}

/** All of a publisher's usable links (active link, approved, offer active): smart-link candidates. */
export async function activeLinksOf(publisherId: number): Promise<Link[]> {
  const rows = await q<Row>(`${LINK_SQL} WHERE l.publisher_id = ? HAVING active = 1`, [publisherId]);
  return rows.map(toLink);
}

/** Called after dashboard changes so this process sees them immediately. */
export function clearLinkCache() {
  cache.clear();
}
