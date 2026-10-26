import { requireAdmin } from '@/lib/auth';
import { chq } from '@/lib/ch';
import { q } from '@/lib/db';
import { count, isoDate, money, pct } from '@/lib/format';

// Clicks come from ClickHouse (pre-aggregated hourly). Conversions and money
// come from Postgres, which reflects approvals and rejections. Days are UTC.
const GROUPS = {
  day: { label: 'Day', ch: 'toString(toDate(hour))', pg: `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')` },
  offer: { label: 'Offer', ch: 'toString(offer_id)', pg: 'offer_id::text' },
  publisher: { label: 'Publisher', ch: 'toString(publisher_id)', pg: 'publisher_id::text' },
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
    chq<{ k: string; clicks: string; uniques: string; flagged: string }>(
      `SELECT ${g.ch} AS k, sum(clicks) AS clicks, uniqMerge(unique_clicks) AS uniques, sum(flagged) AS flagged
       FROM stats_hourly
       WHERE hour >= toDateTime({from:String}, 'UTC') AND hour < toDateTime({to:String}, 'UTC')
       GROUP BY k`,
      { from: `${from} 00:00:00`, to: `${toExcl} 00:00:00` },
    ),
    q<{ k: string; conversions: number; approved: number; pending: number; revenue: string; payout: string }>(
      `SELECT ${g.pg} AS k, count(*)::int AS conversions,
              count(*) FILTER (WHERE status = 'approved')::int AS approved,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              COALESCE(sum(revenue) FILTER (WHERE status <> 'rejected'), 0) AS revenue,
              COALESCE(sum(payout)  FILTER (WHERE status <> 'rejected'), 0) AS payout
       FROM conversions
       WHERE created_at >= $1::date::timestamp AT TIME ZONE 'UTC' AND created_at < $2::date::timestamp AT TIME ZONE 'UTC'
       GROUP BY k`,
      [from, toExcl],
    ),
    q<{ id: string; name: string }>(`SELECT id::text, name FROM offers`),
    q<{ id: string; name: string }>(`SELECT id::text, name FROM publishers`),
  ]);

  const names = new Map<string, string>(
    group === 'offer' ? offers.map((o) => [o.id, o.name]) : group === 'publisher' ? pubs.map((p) => [p.id, p.name]) : [],
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
    Object.assign(row(c.k), { conversions: c.conversions, approved: c.approved, pending: c.pending, revenue: +c.revenue, payout: +c.payout });

  const list = [...rows.values()].sort((a, b) => (group === 'day' ? b.key.localeCompare(a.key) : b.revenue - a.revenue || b.clicks - a.clicks));
  const total = list.reduce(
    (t, r) => ({ ...t, clicks: t.clicks + r.clicks, flagged: t.flagged + r.flagged, conversions: t.conversions + r.conversions, approved: t.approved + r.approved, pending: t.pending + r.pending, revenue: t.revenue + r.revenue, payout: t.payout + r.payout }),
    { key: 'Total', clicks: 0, uniques: NaN, flagged: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, payout: 0 } as Row,
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
                <td className="num">{Number.isNaN(r.uniques) ? '' : count(r.uniques)}</td>
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
      <p className="muted">EPC = publisher earnings per click. Revenue and payout exclude rejected conversions.</p>
    </>
  );
}
