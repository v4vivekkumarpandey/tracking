import { q } from './db';
import type { Usage } from './routing';

// Offer usage for caps and smart-link EPC, cached briefly so the click path
// stays cheap. A cap may overshoot by up to a minute's conversions.

const usageCache = new Map<number, { u: Usage; exp: number }>();

export async function offerUsage(offerId: number): Promise<Usage> {
  const hit = usageCache.get(offerId);
  if (hit && hit.exp > Date.now()) return hit.u;
  const [r] = await q<{ today: string | null; month: string; rev: string | null }>(
    `SELECT SUM(created_at >= UTC_DATE()) AS today, COUNT(*) AS month,
            SUM(CASE WHEN created_at >= UTC_DATE() THEN revenue END) AS rev
     FROM conversions
     WHERE offer_id = ? AND status <> 'rejected' AND created_at >= DATE_FORMAT(UTC_DATE(), '%Y-%m-01')`,
    [offerId],
  );
  const u = { today: Number(r?.today ?? 0), month: Number(r?.month ?? 0), revenueToday: Number(r?.rev ?? 0) };
  if (usageCache.size > 5000) usageCache.clear();
  usageCache.set(offerId, { u, exp: Date.now() + 60_000 });
  return u;
}

let epcCache: { m: Map<number, number>; exp: number } | null = null;

/** Network-wide 7-day earnings per click by offer (more data than one publisher's). */
export async function offerEpc(): Promise<Map<number, number>> {
  if (epcCache && epcCache.exp > Date.now()) return epcCache.m;
  const [clicks, pay] = await Promise.all([
    q<{ offer_id: number; c: string }>(`SELECT offer_id, SUM(clicks) AS c FROM stats_hourly WHERE hour >= UTC_TIMESTAMP() - INTERVAL 7 DAY GROUP BY offer_id`),
    q<{ offer_id: number; p: string }>(`SELECT offer_id, SUM(payout) AS p FROM conversions WHERE status <> 'rejected' AND created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY GROUP BY offer_id`),
  ]);
  const c = new Map(clicks.map((r) => [Number(r.offer_id), Number(r.c)]));
  const m = new Map<number, number>();
  for (const r of pay) {
    const n = c.get(Number(r.offer_id)) ?? 0;
    if (n > 0) m.set(Number(r.offer_id), Number(r.p) / n);
  }
  epcCache = { m, exp: Date.now() + 5 * 60_000 };
  return m;
}

export function clearCapsCache() {
  usageCache.clear();
  epcCache = null;
}
