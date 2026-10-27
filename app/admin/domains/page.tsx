import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { cfHealth } from '@/lib/cloudflare';
import { q } from '@/lib/db';
import { cnameTarget, type DomainRow } from '@/lib/domains';
import { dateTime } from '@/lib/format';
import { adminCheckDomain, adminRemoveDomain, adminSetDomainDisabled } from '../actions';

export default async function AdminDomains() {
  await requireAdmin();
  const [health, rows] = await Promise.all([
    cfHealth(),
    q<DomainRow & { owner_name: string | null }>(
      `SELECT d.*, COALESCE(p.name, a.name) AS owner_name FROM tracking_domains d
       LEFT JOIN publishers p ON d.owner_type = 'publisher' AND p.id = d.owner_id
       LEFT JOIN advertisers a ON d.owner_type = 'advertiser' AND a.id = d.owner_id
       ORDER BY d.status = 'active', d.id DESC`,
    ),
  ]);
  const proxy = (process.env.PROXY_SECRET ?? '').length >= 16;

  return (
    <>
      <div className="crumb">Manage</div>
      <h1>Tracking domains</h1>

      <div className="card stack">
        <h2>Setup status</h2>
        <dl className="facts">
          <dt>Cloudflare API</dt>
          <dd>{health ? <span className="error">{health}</span> : <span className="ok-text">connected</span>}</dd>
          <dt>Worker secret</dt>
          <dd>{proxy ? <span className="ok-text">PROXY_SECRET set</span> : <span className="error">PROXY_SECRET missing (at least 16 characters)</span>}</dd>
          <dt>CNAME target</dt>
          <dd><code>{cnameTarget()}</code></dd>
        </dl>
        <p className="muted">Setup guide: docs/CUSTOM-DOMAINS.md in the project.</p>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Domain</th><th>Owner</th><th>Status</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.hostname}</strong></td>
                <td>
                  <Link href={d.owner_type === 'publisher' ? `/admin/publishers/${d.owner_id}` : `/admin/advertisers/${d.owner_id}`}>{d.owner_name ?? `#${d.owner_id}`}</Link>
                  <div className="muted">{d.owner_type}</div>
                </td>
                <td>
                  <span className={`badge ${d.status === 'active' ? 'active' : d.status === 'disabled' ? 'rejected' : 'pending'}`}>{d.status}</span>
                  {d.last_error && d.status !== 'active' && <div className="muted wrap">{d.last_error}</div>}
                </td>
                <td>{dateTime(d.created_at)}{d.activated_at && <div className="muted">active since {dateTime(d.activated_at)}</div>}</td>
                <td className="actions">
                  {d.status === 'pending' && (
                    <form action={adminCheckDomain} className="inline"><input type="hidden" name="id" value={d.id} /><button className="secondary small">Check now</button></form>
                  )}
                  <form action={adminSetDomainDisabled} className="inline">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="disabled" value={d.status === 'disabled' ? '0' : '1'} />
                    <button className="secondary small">{d.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                  </form>
                  <form action={adminRemoveDomain} className="inline"><input type="hidden" name="id" value={d.id} /><button className="danger small">Remove</button></form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No custom domains yet. Publishers and advertisers add them in their panels.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
