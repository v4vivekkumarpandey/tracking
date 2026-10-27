import { q } from './db';
import type { LandingPage, Rules } from './routing';

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
  attributionDays: number;
  /** Active extra landing pages of the offer (the default is `destination`). */
  landingPages: LandingPage[];
};

// In-process cache so most clicks skip the database lookup. Status changes
// in the dashboard reach clicks within TTL (or at once, via clearLinkCache).
const TTL_MS = 60_000;
const cache = new Map<string, { link: Link | null; exp: number }>();

const LINK_SQL = `
SELECT l.id, l.code, l.offer_id, l.publisher_id, o.advertiser_id, o.destination_url, o.deeplink_enabled, o.deeplink_param,
       o.countries, o.devices, o.os_targets, o.daily_cap, o.monthly_cap, o.daily_budget, o.fallback_offer_id, o.fallback_url, o.attribution_days,
       (l.status = 'active' AND o.status = 'active' AND p.status = 'active'
        AND COALESCE(a.status, '') = 'approved') AS active
FROM tracking_links l
JOIN offers o     ON o.id = l.offer_id
JOIN publishers p ON p.id = l.publisher_id
LEFT JOIN publisher_offer_access a ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id`;

type Row = {
  id: number; code: string; offer_id: number; publisher_id: number; advertiser_id: number; destination_url: string;
  deeplink_enabled: number; deeplink_param: string; countries: string | null; devices: string | null; os_targets: string | null;
  daily_cap: number | null; monthly_cap: number | null; daily_budget: string | null;
  fallback_offer_id: number | null; fallback_url: string | null; attribution_days: number; active: number;
};

function toLink(r: Row): Link {
  return {
    id: Number(r.id), code: r.code, offerId: Number(r.offer_id), publisherId: Number(r.publisher_id),
    advertiserId: Number(r.advertiser_id), destination: r.destination_url, active: Number(r.active) === 1,
    deeplinkEnabled: Number(r.deeplink_enabled) === 1, deeplinkParam: r.deeplink_param || 'click_id',
    rules: {
      countries: r.countries, devices: r.devices, os: r.os_targets,
      daily_cap: r.daily_cap === null ? null : Number(r.daily_cap),
      monthly_cap: r.monthly_cap === null ? null : Number(r.monthly_cap),
      daily_budget: r.daily_budget === null ? null : Number(r.daily_budget),
    },
    fallbackOfferId: r.fallback_offer_id === null ? null : Number(r.fallback_offer_id),
    fallbackUrl: r.fallback_url || null,
    attributionDays: Number(r.attribution_days) || 30,
    landingPages: [],
  };
}

/** Fills in each link's active landing pages (one query for all offers). */
async function withPages(links: Link[]): Promise<Link[]> {
  const ids = [...new Set(links.map((l) => l.offerId))];
  if (ids.length === 0) return links;
  const rows = await q<{ id: number; offer_id: number; name: string; url: string; weight: number }>(
    `SELECT id, offer_id, name, url, weight FROM offer_landing_pages
     WHERE status = 'active' AND offer_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids,
  );
  for (const l of links) {
    l.landingPages = rows.filter((r) => Number(r.offer_id) === l.offerId)
      .map((r) => ({ id: Number(r.id), name: r.name, url: r.url, weight: Number(r.weight) }));
  }
  return links;
}

export async function getLink(code: string): Promise<Link | null> {
  const hit = cache.get(code);
  if (hit && hit.exp > Date.now()) return hit.link;
  const [r] = await q<Row>(`${LINK_SQL} WHERE l.code = ?`, [code]);
  const link = r ? (await withPages([toLink(r)]))[0] : null;
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
  return withPages(rows.map(toLink));
}

/** Called after dashboard changes so this process sees them immediately. */
export function clearLinkCache() {
  cache.clear();
}
