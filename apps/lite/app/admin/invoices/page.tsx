import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { money } from '@/lib/format';
import { ActionForm } from '../../_components/ActionForm';
import { generateInvoicesAction, setInvoiceStatusAction } from '../actions';

const lastMonth = () => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};
const d = (v: Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : '–');

export default async function Invoices() {
  await requireAdmin();
  const [rows, advertisers, [totals], [unbilled]] = await Promise.all([
    q<{ id: number; number: string; advertiser: string; period_from: Date; period_to: Date; total: string; status: string; due_at: Date | null; overdue: number }>(
      `SELECT i.id, i.number, a.name AS advertiser, i.period_from, i.period_to, i.total, i.status, i.due_at,
              (i.status = 'sent' AND i.due_at < UTC_DATE()) AS overdue
       FROM invoices i JOIN advertisers a ON a.id = i.advertiser_id ORDER BY i.id DESC LIMIT 200`,
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM advertisers ORDER BY name`),
    q<{ outstanding: string | null; paid: string | null; drafts: string | null }>(
      `SELECT SUM(CASE WHEN status = 'sent' THEN total END) AS outstanding,
              SUM(CASE WHEN status = 'paid' THEN total END) AS paid,
              SUM(CASE WHEN status = 'draft' THEN total END) AS drafts FROM invoices`,
    ),
    q<{ amount: string | null }>(`SELECT SUM(revenue) AS amount FROM conversions WHERE status = 'approved' AND invoice_id IS NULL`),
  ]);
  const p = lastMonth();

  return (
    <>
      <div className="crumb">Finance</div>
      <h1>Advertiser invoices</h1>
      <div className="kpis">
        <div className="stat"><div className="label">Outstanding (sent)</div><div className="value">{money(totals.outstanding ?? 0)}</div></div>
        <div className="stat"><div className="label">Drafts</div><div className="value">{money(totals.drafts ?? 0)}</div></div>
        <div className="stat"><div className="label">Paid all-time</div><div className="value">{money(totals.paid ?? 0)}</div></div>
        <div className="stat"><div className="label">Approved, not yet invoiced</div><div className="value">{money(unbilled.amount ?? 0)}</div></div>
      </div>

      <ActionForm action={generateInvoicesAction} submit="Generate draft invoices">
        <h2>Generate invoices</h2>
        <p className="muted">One draft per advertiser, from approved conversions in the period that aren&apos;t on an invoice yet. Company details and terms come from <Link href="/admin/settings">Settings</Link>.</p>
        <div className="row">
          <label>From<input type="date" name="from" defaultValue={p.from} required /></label>
          <label>To<input type="date" name="to" defaultValue={p.to} required /></label>
          <label>Advertiser
            <select name="advertiser_id" defaultValue="">
              <option value="">All advertisers</option>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
      </ActionForm>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Number</th><th>Advertiser</th><th>Period</th><th className="num">Total</th><th>Status</th><th>Due</th><th></th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/admin/invoices/${i.id}`}>{i.number}</Link></td>
                <td>{i.advertiser}</td>
                <td>{d(i.period_from)} – {d(i.period_to)}</td>
                <td className="num">{money(i.total)}</td>
                <td><span className={`badge ${i.status === 'paid' ? 'approved' : i.status === 'void' ? 'rejected' : 'pending'}`}>{i.status}</span>{Number(i.overdue) === 1 && <span className="error"> overdue</span>}</td>
                <td>{d(i.due_at)}</td>
                <td className="actions">
                  {i.status === 'draft' && <Status id={i.id} status="sent" label="Mark sent" />}
                  {i.status === 'sent' && <Status id={i.id} status="paid" label="Mark paid" />}
                  {(i.status === 'draft' || i.status === 'sent') && <Status id={i.id} status="void" label="Void" danger />}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">Drafts are only visible to you. &quot;Mark sent&quot; shows the invoice to the advertiser in their panel and sets the due date. Voiding releases its conversions for a new invoice.</p>
    </>
  );
}

function Status({ id, status, label, danger }: { id: number; status: string; label: string; danger?: boolean }) {
  return (
    <form action={setInvoiceStatusAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={danger ? 'danger small' : 'small'}>{label}</button>
    </form>
  );
}
