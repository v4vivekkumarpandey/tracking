import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, isoDate, money, pct } from '@/lib/format';

const GROUPS = { day: 'Day', offer: 'Offer' } as const;
type Group = keyof typeof GROUPS;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
type Row = { key: string; clicks: number; conversions: number; approved: number; pending: number; cost: number };

export default async function AdvertiserReports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const me = await requireAdvertiser();
  const sp = await props.searchParams;
  const today = new Date();
  const from = dateRe.test(sp.from ?? '') ? sp.from! : isoDate(new Date(today.getTime() - 6 * 86400_000));
  const to = dateRe.test(sp.to ?? '') ? sp.to! : isoDate(today);
  const toExcl = isoDate(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400_000));
  const group: Group = sp.group && sp.group in GROUPS ? (sp.group as Group) : 'day';
  const ck = group === 'day' ? `DATE_FORMAT(s.hour, '%Y-%m-%d')` : 'CAST(s.offer_id AS CHAR)';
  const vk = group === 'day' ? `DATE_FORMAT(c.created_at, '%Y-%m-%d')` : 'CAST(c.offer_id AS CHAR)';

  const [clicks, convs, offers] = await Promise.all([
    q<{ k: string; clicks: string }>(
      `SELECT ${ck} AS k, SUM(s.clicks) AS clicks FROM stats_hourly s JOIN offers o ON o.id = s.offer_id
       WHERE o.advertiser_id = ? AND s.hour >= ? AND s.hour < ? GROUP BY k`, [me.advertiserId, from, toExcl],
    ),
    q<{ k: string; conversions: string; approved: string; pending: string; cost: string }>(
      `SELECT ${vk} AS k, SUM(c.status <> 'rejected') AS conversions, SUM(c.status = 'approved') AS approved,
              SUM(c.status = 'pending') AS pending, COALESCE(SUM(CASE WHEN c.status <> 'rejected' THEN c.revenue END), 0) AS cost
       FROM conversions c JOIN offers o ON o.id = c.offer_id
       WHERE o.advertiser_id = ? AND c.created_at >= ? AND c.created_at < ? GROUP BY k`, [me.advertiserId, from, toExcl],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM offers WHERE advertiser_id = ?`, [me.advertiserId]),
  ]);
  const names = new Map(offers.map((o) => [String(o.id), o.name]));
  const rows = new Map<string, Row>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { key: k, clicks: 0, conversions: 0, approved: 0, pending: 0, cost: 0 }).get(k)!;
  for (const c of clicks) row(c.k).clicks = +c.clicks;
  for (const c of convs) Object.assign(row(c.k), { conversions: +c.conversions, approved: +c.approved, pending: +c.pending, cost: +c.cost });
  const list = [...rows.values()].sort((a, b) => (group === 'day' ? b.key.localeCompare(a.key) : b.cost - a.cost));
  const total = list.reduce((t, r) => ({
    key: 'Total', clicks: t.clicks + r.clicks, conversions: t.conversions + r.conversions,
    approved: t.approved + r.approved, pending: t.pending + r.pending, cost: t.cost + r.cost,
  }), { key: 'Total', clicks: 0, conversions: 0, approved: 0, pending: 0, cost: 0 } as Row);

  return (
    <>
      <div className="crumb">Reporting</div>
      <h1>Reports</h1>
      <form className="card row">
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <label>Group by
          <select name="group" defaultValue={group}>
            {(Object.keys(GROUPS) as Group[]).map((k) => <option key={k} value={k}>{GROUPS[k]}</option>)}
          </select>
        </label>
        <button type="submit">Run</button>
        <span className="muted">Days in UTC</span>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>{GROUPS[group]}</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th>
              <th className="num">Approved</th><th className="num">Pending</th><th className="num">Cost</th><th className="num">CPA</th></tr>
          </thead>
          <tbody>
            {[...list, total].map((r) => (
              <tr key={`k-${r.key}`} style={r === total ? { fontWeight: 600 } : undefined}>
                <td>{r === total ? 'Total' : group === 'offer' ? names.get(r.key) ?? `#${r.key}` : r.key}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{count(r.conversions)}</td>
                <td className="num">{pct(r.conversions, r.clicks)}</td>
                <td className="num">{count(r.approved)}</td>
                <td className="num">{count(r.pending)}</td>
                <td className="num">{money(r.cost)}</td>
                <td className="num">{r.conversions ? money(r.cost / r.conversions) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Cost excludes rejected conversions. CPA = cost per conversion.</p>
    </>
  );
}
