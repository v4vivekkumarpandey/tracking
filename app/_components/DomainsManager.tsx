import type { FormState } from '@/lib/account';
import type { DomainRow } from '@/lib/domains';
import { dateTime } from '@/lib/format';
import { ActionForm } from './ActionForm';

const STATUS_TEXT: Record<string, string> = {
  pending: 'waiting for DNS / SSL',
  active: 'active',
  disabled: 'disabled by admin',
};

/** Add / check / remove custom tracking domains (shared by publisher and advertiser panels). */
export function DomainsManager({ domains, add, check, remove, target, enabled, max, usage }: {
  domains: DomainRow[];
  add: (s: FormState, fd: FormData) => Promise<FormState>;
  check: (fd: FormData) => Promise<void>;
  remove: (fd: FormData) => Promise<void>;
  target: string;
  enabled: boolean;
  max: number;
  usage: React.ReactNode;
}) {
  return (
    <>
      <div className="card stack">
        <p>{usage}</p>
        <ol className="steps">
          <li>Add a subdomain you own below, e.g. <code>track.yoursite.com</code>. Use a subdomain, not the main domain.</li>
          <li>At your DNS provider, create a <strong>CNAME</strong> record: name <code>track</code> (the part before your domain) → target <code>{target}</code>.</li>
          <li>Wait for the status to turn <span className="badge active">active</span>. We check automatically every few minutes, usually within an hour, and SSL (https) is set up for you.</li>
        </ol>
        {!enabled && <p className="notice">Custom domains are not switched on yet. You can add your domain now, and it activates once they are.</p>}
      </div>

      <div className="card table-wrap">
        <h2>Your domains ({domains.length}/{max})</h2>
        <table>
          <thead><tr><th>Domain</th><th>DNS record to create</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.hostname}</strong><div className="muted">added {dateTime(d.created_at)}</div></td>
                <td><code>CNAME {d.hostname} → {target}</code></td>
                <td>
                  <span className={`badge ${d.status === 'active' ? 'active' : d.status === 'disabled' ? 'rejected' : 'pending'}`}>
                    {STATUS_TEXT[d.status] ?? d.status}
                  </span>
                  {d.status !== 'active' && d.last_error && <div className="muted wrap">{d.last_error}</div>}
                  {d.checked_at && <div className="muted">checked {dateTime(d.checked_at)}</div>}
                </td>
                <td className="actions">
                  {d.status === 'pending' && (
                    <form action={check} className="inline">
                      <input type="hidden" name="id" value={d.id} />
                      <button className="secondary small">Check now</button>
                    </form>
                  )}
                  <form action={remove} className="inline">
                    <input type="hidden" name="id" value={d.id} />
                    <button className="danger small">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {domains.length === 0 && <tr><td colSpan={4} className="muted">No domains yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {domains.length < max && (
        <ActionForm action={add} submit="Add domain" reset>
          <h2>Add a domain</h2>
          <label>Domain<input name="hostname" required placeholder="track.yoursite.com" maxLength={253} /></label>
        </ActionForm>
      )}
    </>
  );
}
