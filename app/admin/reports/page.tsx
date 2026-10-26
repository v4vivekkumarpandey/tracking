import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, isoDate, money, pct } from '@/lib/format';

// Clicks come from the hourly stats table; conversions and money from the
// conversions table, which reflects approvals and rejections. Days are UTC.
const GROUPS = {
  day: { label: 'Day', clicks: `DATE_FORMAT(hour, '%Y-%m-%d')`, conv: `DATE_FORMAT(created_at, '%Y-%m-%d')` },
  offer: { label: 'Offer', clicks: 'CAST(offer_id AS CHAR)', conv: 'CAST(offer_id AS CHAR)' },
  publisher: { label: 'Publisher', clicks: 'CAST(publisher_id AS CHAR)', conv: 'CAST(publisher_id AS CHAR)' },
} as const;
type Group = keyof typeof GROUPS;

type Row = {
  key: string; clicks: number; uniques: number; flagged: number;
  conversions: number; approved: number; pending: number; revenue: number; payout: number;
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export default async function Reports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const today = new Date();
  const from = dateRe.test(searchParams.from ?? '') ? searchParams.from! : isoDate(new Date(today.getTime() - 6 * 86400_000));
  const to = dateRe.test(searchParams.to ?? '') ? searchParams.to! : isoDate(today);
  const toExcl = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400_000));
  const group: Group = searchParams.group && searchParams.group in GROUPS ? (searchParams.group as Group) : 'day';
  const g = GROUPS[group];

  const [clickRows, convRows, offers, pubs] = await Promise.all([
    q<{ k: string; clicks: string; uniques: string; flagged: string }>(
      `SELECT ${g.clicks} AS k, SUM(clicks) AS clicks, SUM(uniques) AS uniques, SUM(flagged) AS flagged
       FROM stats_hourly WHERE hour >= ? AND hour < ? GROUP BY k`,
      [from, toExcl],
    ),
    q<{ k: string; conversions: string; approved: string; pending: string; revenue: string; payout: string }>(
      `SELECT ${g.conv} AS k, COUNT(*) AS conversions,
              SUM(status = 'approved') AS approved,
              SUM(status = 'pending') AS pending,
              COALESCE(SUM(CASE WHEN status <> 'rejected' THEN revenue END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status <> 'rejected' THEN payout END), 0) AS payout
       FROM conversions WHERE created_at >= ? AND created_at < ? GROUP BY k`,
      [from, toExcl],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM offers`),
    q<{ id: number; name: string }>(`SELECT id, name FROM publishers`),
  ]);

  const names = new Map<string, string>(
    group === 'offer' ? offers.map((o) => [String(o.id), o.name]) : group === 'publisher' ? pubs.map((p) => [String(p.id), p.name]) : [],
  );

  const rows = new Map<string, Row>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, clicks: 0, uniques: 0, flagged: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, payout: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const c of clickRows) Object.assign(row(c.k), { clicks: +c.clicks, uniques: +c.uniques, flagged: +c.flagged });
  for (const c of convRows)
    Object.assign(row(c.k), { conversions: +c.conversions, approved: +c.approved, pending: +c.pending, revenue: +c.revenue, payout: +c.payout });

  const list = [...rows.values()].sort((a, b) => (group === 'day' ? b.key.localeCompare(a.key) : b.revenue - a.revenue || b.clicks - a.clicks));
  const total = list.reduce<Row>(
    (t, r) => ({
      ...t, clicks: t.clicks + r.clicks, uniques: t.uniques + r.uniques, flagged: t.flagged + r.flagged,
      conversions: t.conversions + r.conversions, approved: t.approved + r.approved, pending: t.pending + r.pending,
      revenue: t.revenue + r.revenue, payout: t.payout + r.payout,
    }),
    { key: 'Total', clicks: 0, uniques: 0, flagged: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, payout: 0 },
  );

  return (
    <>
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
        <span className="muted">Days in UTC</span>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{g.label}</th><th className="num">Clicks</th><th className="num">Unique</th><th className="num">Flagged</th>
              <th className="num">Conv.</th><th className="num">CR</th><th className="num">Approved</th><th className="num">Pending</th>
              <th className="num">Revenue</th><th className="num">Payout</th><th className="num">Margin</th><th className="num">EPC</th>
            </tr>
          </thead>
          <tbody>
            {[...list, total].map((r) => (
              <tr key={r.key} style={r === total ? { fontWeight: 600 } : undefined}>
                <td>{names.get(r.key) ?? r.key}{names.has(r.key) && <span className="muted"> #{r.key}</span>}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{count(r.uniques)}</td>
                <td className="num">{count(r.flagged)}</td>
                <td className="num">{count(r.conversions)}</td>
                <td className="num">{pct(r.conversions, r.clicks)}</td>
                <td className="num">{count(r.approved)}</td>
                <td className="num">{count(r.pending)}</td>
                <td className="num">{money(r.revenue)}</td>
                <td className="num">{money(r.payout)}</td>
                <td className="num">{money(r.revenue - r.payout)}</td>
                <td className="num">{r.clicks ? money(r.payout / r.clicks) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        EPC = publisher earnings per click. Revenue and payout exclude rejected conversions. Unique = first click per IP per offer per day.
      </p>
    </>
  );
}
