import { requireAdmin } from '@/lib/auth';
import { ALL } from '@/lib/dashboard';
import { count, money, pct } from '@/lib/format';
import { parseRange, runReport, type Group } from '@/lib/reports';

const GROUPS: Partial<Record<Group, string>> = { day: 'Day', offer: 'Offer', publisher: 'Publisher' };

export default async function Reports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  await requireAdmin();
  const sp = await props.searchParams;
  const { from, to, toExcl } = parseRange(sp);
  const group = (sp.group && sp.group in GROUPS ? sp.group : 'day') as Group;
  const { rows, total } = await runReport(ALL, group, from, toExcl);
  const csv = `/export/admin/reports?from=${from}&to=${to}&group=${group}`;

  return (
    <>
      <div className="title-row">
        <h1>Reports</h1>
        <a href={csv} className="button secondary-button">Download CSV</a>
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
            <tr>
              <th>{GROUPS[group]}</th><th className="num">Clicks</th><th className="num">Unique</th><th className="num">Flagged</th><th className="num" title="Sent to a fallback by targeting or caps">Redirected</th>
              <th className="num">Conv.</th><th className="num">CR</th><th className="num">Approved</th><th className="num">Pending</th>
              <th className="num">Revenue</th><th className="num">Payout</th><th className="num">Margin</th><th className="num">EPC</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, total].map((r) => (
              <tr key={`k-${r.key}`} style={r === total ? { fontWeight: 600 } : undefined}>
                <td>{r.label}{(group === 'offer' || group === 'publisher') && r !== total && <span className="muted"> #{r.key}</span>}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{count(r.uniques)}</td>
                <td className="num">{count(r.flagged)}</td>
                <td className="num">{count(r.redirected)}</td>
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
        EPC = publisher earnings per click. Conversions, revenue and payout exclude rejected conversions. Unique = first click per IP per offer per day.
      </p>
    </>
  );
}
