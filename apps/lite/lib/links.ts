import { q } from './db';

export type Link = {
  id: number;
  offerId: number;
  publisherId: number;
  destination: string;
  /** False if the link, offer or publisher is paused, or access was revoked. */
  active: boolean;
};

// In-process cache so most clicks skip the database lookup. Status changes
// in the dashboard reach clicks within TTL.
const TTL_MS = 60_000;
const cache = new Map<string, { link: Link | null; exp: number }>();

export async function getLink(code: string): Promise<Link | null> {
  const hit = cache.get(code);
  if (hit && hit.exp > Date.now()) return hit.link;

  const rows = await q<{ id: number; offer_id: number; publisher_id: number; destination_url: string; active: number }>(
    `SELECT l.id, l.offer_id, l.publisher_id, o.destination_url,
            (l.status = 'active' AND o.status = 'active' AND p.status = 'active'
             AND COALESCE(a.status, '') = 'approved') AS active
     FROM tracking_links l
     JOIN offers o     ON o.id = l.offer_id
     JOIN publishers p ON p.id = l.publisher_id
     LEFT JOIN publisher_offer_access a ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id
     WHERE l.code = ?`,
    [code],
  );
  const r = rows[0];
  const link: Link | null = r
    ? { id: Number(r.id), offerId: Number(r.offer_id), publisherId: Number(r.publisher_id), destination: r.destination_url, active: Number(r.active) === 1 }
    : null;

  if (cache.size > 10_000) cache.clear();
  // Unknown codes are cached briefly too, so junk traffic can't hammer MySQL.
  cache.set(code, { link, exp: Date.now() + (link ? TTL_MS : 10_000) });
  return link;
}

/** Called after dashboard changes so this process sees them immediately. */
export function clearLinkCache() {
  cache.clear();
}
