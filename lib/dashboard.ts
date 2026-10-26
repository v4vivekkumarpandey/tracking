import { q } from './db';

export type Day = { date: string; clicks: number; conversions: number; revenue: number; payout: number };
export type Metric = 'clicks' | 'conversions' | 'cvr' | 'revenue' | 'payout' | 'margin' | 'epc';

/**
 * Whose numbers to load: everything (admin), one publisher, or one
 * advertiser's offers. Always built from the session, never from user input.
 */
export type Scope = { kind: 'all' } | { kind: 'publisher'; id: number } | { kind: 'advertiser'; id: number };
export const ALL: Scope = { kind: 'all' };

/** JOIN/WHERE fragments for a table aliased `t` with offer_id and publisher_id columns. */
function scoped(scope: Scope): { join: string; where: string; params: number[] } {
  switch (scope.kind) {
    case 'publisher': return { join: '', where: ' AND t.publisher_id = ?', params: [scope.id] };
    case 'advertiser': return { join: ' JOIN offers so ON so.id = t.offer_id', where: ' AND so.advertiser_id = ?', params: [scope.id] };
    default: return { join: '', where: '', params: [] };
  }
}

const key = (d: Date) => d.toISOString().slice(0, 10);
const empty = (date: string): Day => ({ date, clicks: 0, conversions: 0, revenue: 0, payout: 0 });

/**
 * Daily totals for the current and previous calendar month (UTC).
 * Clicks come from stats_hourly; conversions and money from non-rejected
 * conversions, so the dashboard matches the Reports page.
 */
export async function loadMonths(now = new Date(), scope: Scope = ALL) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastStart = new Date(Date.UTC(y, m - 1, 1));
  const curStart = new Date(Date.UTC(y, m, 1));
  const nextStart = new Date(Date.UTC(y, m + 1, 1));
  const s = scoped(scope);

  const [clicks, convs] = await Promise.all([
    q<{ d: string; clicks: string }>(
      `SELECT DATE_FORMAT(t.hour, '%Y-%m-%d') AS d, SUM(t.clicks) AS clicks
       FROM stats_hourly t${s.join} WHERE t.hour >= ? AND t.hour < ?${s.where} GROUP BY d`,
      [lastStart, nextStart, ...s.params],
    ),
    q<{ d: string; conversions: string; revenue: string; payout: string }>(
      `SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') AS d, COUNT(*) AS conversions,
              SUM(t.revenue) AS revenue, SUM(t.payout) AS payout
       FROM conversions t${s.join}
       WHERE t.created_at >= ? AND t.created_at < ? AND t.status <> 'rejected'${s.where} GROUP BY d`,
      [lastStart, nextStart, ...s.params],
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
    case 'epc': return clicks ? payout / clicks : 0;
  }
}

/** Month-to-date vs the same days of last month, in percent; null if no base. */
export function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export type OfferRow = { id: number; name: string; clicks: number; conversions: number; revenue: number; payout: number };

/** This month's offers within the scope, best first. */
export async function topOffers(now = new Date(), limit = 10, scope: Scope = ALL): Promise<OfferRow[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const s = scoped(scope);
  const offerFilter =
    scope.kind === 'advertiser' ? ` AND o.advertiser_id = ${Number(scope.id)}`
    : scope.kind === 'publisher'
      ? ` AND o.id IN (SELECT offer_id FROM publisher_offer_access WHERE publisher_id = ${Number(scope.id)} AND status = 'approved')`
      : '';
  const [clicks, convs, offers] = await Promise.all([
    q<{ offer_id: number; clicks: string }>(
      `SELECT t.offer_id, SUM(t.clicks) AS clicks FROM stats_hourly t${s.join}
       WHERE t.hour >= ?${s.where} GROUP BY t.offer_id`, [start, ...s.params],
    ),
    q<{ offer_id: number; conversions: string; revenue: string; payout: string }>(
      `SELECT t.offer_id, COUNT(*) AS conversions, SUM(t.revenue) AS revenue, SUM(t.payout) AS payout
       FROM conversions t${s.join}
       WHERE t.created_at >= ? AND t.status <> 'rejected'${s.where} GROUP BY t.offer_id`, [start, ...s.params],
    ),
    q<{ id: number; name: string }>(`SELECT o.id, o.name FROM offers o WHERE o.status <> 'archived'${offerFilter}`),
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
    .sort((a, b) => b.revenue - a.revenue || b.payout - a.payout || b.clicks - a.clicks || a.name.localeCompare(b.name))
    .slice(0, limit);
}
