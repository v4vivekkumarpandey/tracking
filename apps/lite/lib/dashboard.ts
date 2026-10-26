import { q } from './db';

export type Day = { date: string; clicks: number; conversions: number; revenue: number; payout: number };
export type Metric = 'clicks' | 'conversions' | 'cvr' | 'revenue' | 'payout' | 'margin';

const key = (d: Date) => d.toISOString().slice(0, 10);
const empty = (date: string): Day => ({ date, clicks: 0, conversions: 0, revenue: 0, payout: 0 });

/**
 * Daily totals for the current and previous calendar month (UTC).
 * Clicks come from stats_hourly; conversions and money from non-rejected
 * conversions, so the dashboard matches the Reports page.
 */
export async function loadMonths(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastStart = new Date(Date.UTC(y, m - 1, 1));
  const curStart = new Date(Date.UTC(y, m, 1));
  const nextStart = new Date(Date.UTC(y, m + 1, 1));

  const [clicks, convs] = await Promise.all([
    q<{ d: string; clicks: string }>(
      `SELECT DATE_FORMAT(hour, '%Y-%m-%d') AS d, SUM(clicks) AS clicks
       FROM stats_hourly WHERE hour >= ? AND hour < ? GROUP BY d`,
      [lastStart, nextStart],
    ),
    q<{ d: string; conversions: string; revenue: string; payout: string }>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS conversions,
              SUM(revenue) AS revenue, SUM(payout) AS payout
       FROM conversions WHERE created_at >= ? AND created_at < ? AND status <> 'rejected' GROUP BY d`,
      [lastStart, nextStart],
    ),
  ]);

  const byDate = new Map<string, Day>();
  const get = (d: string) => byDate.get(d) ?? byDate.set(d, empty(d)).get(d)!;
  for (const r of clicks) get(r.d).clicks = Number(r.clicks);
  for (const r of convs) Object.assign(get(r.d), { conversions: Number(r.conversions), revenue: Number(r.revenue), payout: Number(r.payout) });

  const span = (start: Date, end: Date) => {
    const days: Day[] = [];
    for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
      const d = key(new Date(t));
      days.push(byDate.get(d) ?? empty(d));
    }
    return days;
  };

  return {
    current: span(curStart, nextStart),
    last: span(lastStart, curStart),
    /** Index of today within `current`. */
    today: now.getUTCDate() - 1,
    day: (d: Date) => byDate.get(key(d)) ?? empty(key(d)),
  };
}

export function value(days: Day[], metric: Metric): number {
  let clicks = 0, conversions = 0, revenue = 0, payout = 0;
  for (const d of days) {
    clicks += d.clicks;
    conversions += d.conversions;
    revenue += d.revenue;
    payout += d.payout;
  }
  switch (metric) {
    case 'clicks': return clicks;
    case 'conversions': return conversions;
    case 'cvr': return clicks ? (conversions / clicks) * 100 : 0;
    case 'revenue': return revenue;
    case 'payout': return payout;
    case 'margin': return revenue - payout;
  }
}

/** Month-to-date vs the same days of last month, in percent; null if no base. */
export function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export type OfferRow = { id: number; name: string; clicks: number; conversions: number; revenue: number; payout: number };

/** This month's offers, best first. */
export async function topOffers(now = new Date(), limit = 10): Promise<OfferRow[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [clicks, convs, offers] = await Promise.all([
    q<{ offer_id: number; clicks: string }>(
      `SELECT offer_id, SUM(clicks) AS clicks FROM stats_hourly WHERE hour >= ? GROUP BY offer_id`, [start],
    ),
    q<{ offer_id: number; conversions: string; revenue: string; payout: string }>(
      `SELECT offer_id, COUNT(*) AS conversions, SUM(revenue) AS revenue, SUM(payout) AS payout
       FROM conversions WHERE created_at >= ? AND status <> 'rejected' GROUP BY offer_id`, [start],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM offers WHERE status <> 'archived'`),
  ]);
  const rows = new Map<number, OfferRow>(offers.map((o) => [Number(o.id), { id: Number(o.id), name: o.name, clicks: 0, conversions: 0, revenue: 0, payout: 0 }]));
  for (const c of clicks) {
    const r = rows.get(Number(c.offer_id));
    if (r) r.clicks = Number(c.clicks);
  }
  for (const c of convs) {
    const r = rows.get(Number(c.offer_id));
    if (r) Object.assign(r, { conversions: Number(c.conversions), revenue: Number(c.revenue), payout: Number(c.payout) });
  }
  return [...rows.values()]
    .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks || a.name.localeCompare(b.name))
    .slice(0, limit);
}
