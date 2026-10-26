import { requirePublisher } from '@/lib/auth';
import { count, money, pct } from '@/lib/format';
import { parseRange, runReport, type Group } from '@/lib/reports';

// sub1 needs raw clicks, kept for CLICK_RETENTION_DAYS (90 by default), so
// ranges are capped at 90 days.
const GROUPS: Partial<Record<Group, string>> = { day: 'Day', offer: 'Offer', sub1: 'Sub ID 1', source: 'Traffic source', channel: 'Channel' };

export default async function PublisherReports(props: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const me = await requirePublisher();
  const sp = await props.searchParams;
  const { from, to, toExcl } = parseRange(sp, 90);
  const group = (sp.group && sp.group in GROUPS ? sp.group : 'day') as Group;
  const { rows, total } = await runReport({ kind: 'publisher', id: me.publisherId }, group, from, toExcl);

  return (
    <>
      <div className="crumb">Reporting</div>
      <div className="title-row">
        <h1>Reports</h1>
        <a href={`/export/publisher/reports?from=${from}&to=${to}&group=${group}`} className="button secondary-button">Download CSV</a>
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
        <span className="muted">Days in UTC · up to 90 days</span>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{GROUPS[group]}</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th>
              <th className="num">Approved</th><th className="num">Pending</th><th className="num">Earnings</th><th className="num">EPC</th>
            </tr>
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
                <td className="num">{money(r.payout)}</td>
                <td className="num">{r.clicks ? money(r.payout / r.clicks) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
