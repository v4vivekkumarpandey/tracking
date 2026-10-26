import type { Scope } from './dashboard';
import { q } from './db';
import { isoDate } from './format';
import { channelLabel, sourceLabel } from './sourceLabels';

// One report engine for the admin, publisher and advertiser Reports pages
// and their CSV exports, so a download always matches what's on screen.
// Clicks come from stats_hourly (or raw clicks for sub1); conversions and
// money from non-rejected conversions. Days are UTC.

export type Group = 'day' | 'offer' | 'publisher' | 'sub1' | 'source' | 'channel';

/** Groups that need raw clicks (kept for CLICK_RETENTION_DAYS, 90 by default). */
export const RAW_GROUPS: Group[] = ['sub1', 'source', 'channel'];
const RAW_COL: Partial<Record<Group, string>> = { sub1: 't.sub1', source: 't.traffic_source', channel: 't.traffic_channel' };
export type ReportRow = {
  key: string; label: string; clicks: number; uniques: number; flagged: number; redirected: number;
  conversions: number; approved: number; pending: number; revenue: number; payout: number;
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/** Date range from query params (default: last 7 days), optionally capped to maxDays. */
export function parseRange(sp: { from?: string; to?: string }, maxDays?: number) {
  const today = new Date();
  const to = dateRe.test(sp.to ?? '') ? sp.to! : isoDate(today);
  let from = dateRe.test(sp.from ?? '') ? sp.from! : isoDate(new Date(today.getTime() - 6 * DAY));
  if (maxDays) {
    const earliest = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() - (maxDays - 1) * DAY));
    if (from < earliest) from = earliest;
  }
  const toExcl = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() + DAY));
  return { from, to, toExcl };
}

function where(scope: Scope, alias: string): { join: string; sql: string; params: number[] } {
  if (scope.kind === 'publisher') return { join: '', sql: ` AND ${alias}.publisher_id = ?`, params: [scope.id] };
  if (scope.kind === 'advertiser') return { join: ` JOIN offers ro ON ro.id = ${alias}.offer_id`, sql: ' AND ro.advertiser_id = ?', params: [scope.id] };
  return { join: '', sql: '', params: [] };
}

export async function runReport(scope: Scope, group: Group, from: string, toExcl: string) {
  const s = where(scope, 't');
  const clickKey = { day: `DATE_FORMAT(t.hour, '%Y-%m-%d')`, offer: 'CAST(t.offer_id AS CHAR)', publisher: 'CAST(t.publisher_id AS CHAR)', sub1: '', source: '', channel: '' }[group];
  const convKey = { day: `DATE_FORMAT(t.created_at, '%Y-%m-%d')`, offer: 'CAST(t.offer_id AS CHAR)', publisher: 'CAST(t.publisher_id AS CHAR)', sub1: 't.sub1', source: 't.traffic_source', channel: 't.traffic_channel' }[group];

  // Clicks sent to a fallback URL (targeting/caps) count as "redirected", not as clicks.
  const clicksSql = RAW_GROUPS.includes(group)
    ? `SELECT ${RAW_COL[group]} AS k, SUM(t.redirect_reason IS NULL) AS clicks, 0 AS uniques,
              SUM(t.redirect_reason IS NULL AND (t.is_bot OR t.is_duplicate)) AS flagged, SUM(t.redirect_reason IS NOT NULL) AS redirected
       FROM clicks t${s.join} WHERE t.ts >= ? AND t.ts < ?${s.sql} GROUP BY k`
    : `SELECT ${clickKey} AS k, SUM(t.clicks) AS clicks, SUM(t.uniques) AS uniques, SUM(t.flagged) AS flagged, SUM(t.redirected) AS redirected
       FROM stats_hourly t${s.join} WHERE t.hour >= ? AND t.hour < ?${s.sql} GROUP BY k`;

  const [clicks, convs, names] = await Promise.all([
    q<{ k: string; clicks: string; uniques: string; flagged: string; redirected: string }>(clicksSql, [from, toExcl, ...s.params]),
    q<{ k: string; conversions: string; approved: string; pending: string; revenue: string; payout: string }>(
      `SELECT ${convKey} AS k, SUM(t.status <> 'rejected') AS conversions,
              SUM(t.status = 'approved') AS approved, SUM(t.status = 'pending') AS pending,
              COALESCE(SUM(CASE WHEN t.status <> 'rejected' THEN t.revenue END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN t.status <> 'rejected' THEN t.payout END), 0) AS payout
       FROM conversions t${s.join} WHERE t.created_at >= ? AND t.created_at < ?${s.sql} GROUP BY k`,
      [from, toExcl, ...s.params],
    ),
    group === 'offer' ? q<{ id: number; name: string }>(`SELECT id, name FROM offers`)
      : group === 'publisher' ? q<{ id: number; name: string }>(`SELECT id, name FROM publishers`)
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);
  const nameOf = new Map(names.map((n) => [String(n.id), n.name]));

  const rows = new Map<string, ReportRow>();
  const row = (k: string) => {
    let r = rows.get(k);
    if (!r) {
      const label = group === 'offer' || group === 'publisher' ? nameOf.get(k) ?? `#${k}`
        : group === 'source' ? (k ? sourceLabel(k) : 'Not recorded')
        : group === 'channel' ? (k ? channelLabel(k) : 'Not recorded')
        : k || '(empty)';
      r = { key: k, label, clicks: 0, uniques: 0, flagged: 0, redirected: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, payout: 0 };
      rows.set(k, r);
    }
    return r;
  };
  for (const c of clicks) Object.assign(row(c.k ?? ''), { clicks: +c.clicks, uniques: +c.uniques, flagged: +c.flagged, redirected: +c.redirected });
  for (const c of convs) Object.assign(row(c.k ?? ''), {
    conversions: +c.conversions, approved: +c.approved, pending: +c.pending, revenue: +c.revenue, payout: +c.payout,
  });

  const list = [...rows.values()].sort((a, b) =>
    group === 'day' ? b.key.localeCompare(a.key) : b.revenue - a.revenue || b.payout - a.payout || b.clicks - a.clicks);
  const total = list.reduce<ReportRow>((t, r) => ({
    ...t, clicks: t.clicks + r.clicks, uniques: t.uniques + r.uniques, flagged: t.flagged + r.flagged, redirected: t.redirected + r.redirected,
    conversions: t.conversions + r.conversions, approved: t.approved + r.approved, pending: t.pending + r.pending,
    revenue: t.revenue + r.revenue, payout: t.payout + r.payout,
  }), { key: 'Total', label: 'Total', clicks: 0, uniques: 0, flagged: 0, redirected: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, payout: 0 });
  return { rows: list, total };
}
