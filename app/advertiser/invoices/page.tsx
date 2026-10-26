import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { money } from '@/lib/format';

const d = (v: Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : '–');

export default async function AdvertiserInvoices() {
  const me = await requireAdvertiser();
  const rows = await q<{ id: number; number: string; period_from: Date; period_to: Date; total: string; status: string; due_at: Date | null; overdue: number }>(
    `SELECT id, number, period_from, period_to, total, status, due_at, (status = 'sent' AND due_at < UTC_DATE()) AS overdue
     FROM invoices WHERE advertiser_id = ? AND status IN ('sent', 'paid') ORDER BY id DESC`, [me.advertiserId],
  );
  const due = rows.filter((r) => r.status === 'sent').reduce((s, r) => s + Number(r.total), 0);
  return (
    <>
      <div className="crumb">Account</div>
      <h1>Invoices</h1>
      <div className="kpis">
        <div className="stat"><div className="label">Amount due</div><div className="value">{money(due)}</div></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Number</th><th>Period</th><th className="num">Total</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/advertiser/invoices/${i.id}`}>{i.number}</Link></td>
                <td>{d(i.period_from)} – {d(i.period_to)}</td>
                <td className="num">{money(i.total)}</td>
                <td><span className={`badge ${i.status === 'paid' ? 'approved' : 'pending'}`}>{i.status === 'sent' ? 'due' : i.status}</span>{Number(i.overdue) === 1 && <span className="error"> overdue</span>}</td>
                <td>{d(i.due_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
