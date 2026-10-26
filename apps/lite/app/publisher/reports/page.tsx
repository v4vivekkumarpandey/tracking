import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, isoDate, money, pct } from '@/lib/format';

// Day / offer come from the hourly stats; sub1 needs raw clicks, which are
// kept for CLICK_RETENTION_DAYS (90 by default), so ranges are capped at 90 days.
const GROUPS = {
  day: { label: 'Day' },
  offer: { label: 'Offer' },
  sub1: { label: 'Sub ID 1' },
} as const;
type Group = keyof typeof GROUPS;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

type Row = { key: string; clicks: number; conversions: number; approved: number; pending: number; earnings: number };

export default async function PublisherReports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const me = await requirePublisher();
  const sp = await props.searchParams;
  const today = new Date();
  let from = dateRe.test(sp.from ?? '') ? sp.from! : isoDate(new Date(today.getTime() - 6 * 86400_000));
  const to = dateRe.test(sp.to ?? '') ? sp.to! : isoDate(today);
  const toExcl = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400_000));
  const earliest = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() - 89 * 86400_000));
  if (from < earliest) from = earliest;
  const group: Group = sp.group && sp.group in GROUPS ? (sp.group as Group) : 'day';

  const clickSql = {
    day: `SELECT DATE_FORMAT(hour, '%Y-%m-%d') AS k, SUM(clicks) AS clicks FROM stats_hourly WHERE publisher_id = ? AND hour >= ? AND hour < ? GROUP BY k`,
    offer: `SELECT CAST(offer_id AS CHAR) AS k, SUM(clicks) AS clicks FROM stats_hourly WHERE publisher_id = ? AND hour >= ? AND hour < ? GROUP BY k`,
    sub1: `SELECT sub1 AS k, COUNT(*) AS clicks FROM clicks WHERE publisher_id = ? AND ts >= ? AND ts < ? GROUP BY k`,
  }[group];
  const convKey = { day: `DATE_FORMAT(created_at, '%Y-%m-%d')`, offer: 'CAST(offer_id AS CHAR)', sub1: 'sub1' }[group];

  const [clicks, convs, offers] = await Promise.all([
    q<{ k: string; clicks: string }>(clickSql, [me.publisherId, from, toExcl]),
    q<{ k: string; conversions: string; approved: string; pending: string; earnings: string }>(
      `SELECT ${convKey} AS k, SUM(status <> 'rejected') AS conversions, SUM(status = 'approved') AS approved,
              SUM(status = 'pending') AS pending, COALESCE(SUM(CASE WHEN status <> 'rejected' THEN payout END), 0) AS earnings
       FROM conversions WHERE publisher_id = ? AND created_at >= ? AND created_at < ? GROUP BY k`,
      [me.publisherId, from, toExcl],
    ),
    group === 'offer' ? q<{ id: number; name: string }>(`SELECT id, name FROM offers`) : Promise.resolve([]),
  ]);
  const names = new Map(offers.map((o) => [String(o.id), o.name]));

  const rows = new Map<string, Row>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { key: k, clicks: 0, conversions: 0, approved: 0, pending: 0, earnings: 0 }).get(k)!;
  for (const c of clicks) row(c.k).clicks = +c.clicks;
  for (const c of convs) Object.assign(row(c.k), { conversions: +c.conversions, approved: +c.approved, pending: +c.pending, earnings: +c.earnings });
  const list = [...rows.values()].sort((a, b) => (group === 'day' ? b.key.localeCompare(a.key) : b.earnings - a.earnings || b.clicks - a.clicks));
  const total = list.reduce((t, r) => ({
    key: 'Total', clicks: t.clicks + r.clicks, conversions: t.conversions + r.conversions,
    approved: t.approved + r.approved, pending: t.pending + r.pending, earnings: t.earnings + r.earnings,
  }), { key: 'Total', clicks: 0, conversions: 0, approved: 0, pending: 0, earnings: 0 } as Row);

  return (
    <>
      <div className="crumb">Reporting</div>
      <h1>Reports</h1>
      <form className="card row">
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <label>Group by
          <select name="group" defaultValue={group}>
            {(Object.keys(GROUPS) as Group[]).map((k) => <option key={k} value={k}>{GROUPS[k].label}</option>)}
          </select>
        </label>
        <button type="submit">Run</button>
        <span className="muted">Days in UTC · up to 90 days</span>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{GROUPS[group].label}</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th>
              <th className="num">Approved</th><th className="num">Pending</th><th className="num">Earnings</th><th className="num">EPC</th>
            </tr>
          </thead>
          <tbody>
            {[...list, total].map((r) => (
              <tr key={`k-${r.key}`} style={r === total ? { fontWeight: 600 } : undefined}>
                <td>{r === total ? 'Total' : group === 'offer' ? names.get(r.key) ?? `#${r.key}` : r.key || <span className="muted">(empty)</span>}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{count(r.conversions)}</td>
                <td className="num">{pct(r.conversions, r.clicks)}</td>
                <td className="num">{count(r.approved)}</td>
                <td className="num">{count(r.pending)}</td>
                <td className="num">{money(r.earnings)}</td>
                <td className="num">{r.clicks ? money(r.earnings / r.clicks) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
