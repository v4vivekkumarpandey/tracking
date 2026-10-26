import { requireAdvertiser } from '@/lib/auth';
import { count, money, pct } from '@/lib/format';
import { parseRange, runReport, type Group } from '@/lib/reports';

const GROUPS: Partial<Record<Group, string>> = { day: 'Day', offer: 'Offer' };

export default async function AdvertiserReports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const me = await requireAdvertiser();
  const sp = await props.searchParams;
  const { from, to, toExcl } = parseRange(sp);
  const group = (sp.group && sp.group in GROUPS ? sp.group : 'day') as Group;
  const { rows, total } = await runReport({ kind: 'advertiser', id: me.advertiserId }, group, from, toExcl);

  return (
    <>
      <div className="crumb">Reporting</div>
      <div className="title-row">
        <h1>Reports</h1>
        <a href={`/export/advertiser/reports?from=${from}&to=${to}&group=${group}`} className="button secondary-button">Download CSV</a>
      </div>
      <form className="card row">
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <label>Group by
          <select name="group" defaultValue={group}>
            {Object.entries(GROUPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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
            {[...rows, total].map((r) => (
              <tr key={`k-${r.key}`} style={r === total ? { fontWeight: 600 } : undefined}>
                <td>{r.label}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{count(r.conversions)}</td>
                <td className="num">{pct(r.conversions, r.clicks)}</td>
                <td className="num">{count(r.approved)}</td>
                <td className="num">{count(r.pending)}</td>
                <td className="num">{money(r.revenue)}</td>
                <td className="num">{r.conversions ? money(r.revenue / r.conversions) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Cost excludes rejected conversions. CPA = cost per conversion.</p>
    </>
  );
}
