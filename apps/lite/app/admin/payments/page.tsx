import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { balances } from '@/lib/balance';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';
import { RecordPayment } from '../RecordPayment';

export default async function Payments() {
  await requireAdmin();
  const [rows, recent] = await Promise.all([
    balances(),
    q<{ id: number; publisher_id: number; name: string; amount: string; method: string; reference: string | null; paid_at: Date }>(
      `SELECT pay.id, pay.publisher_id, p.name, pay.amount, pay.method, pay.reference, pay.paid_at
       FROM payments pay JOIN publishers p ON p.id = pay.publisher_id ORDER BY pay.paid_at DESC LIMIT 30`,
    ),
  ]);
  const owed = rows.filter((r) => r.balance > 0);

  return (
    <>
      <div className="crumb">Finance</div>
      <h1>Publisher payments</h1>
      <p className="muted">
        Balance = approved earnings − payments recorded. Pay through PayPal, Wise or bank, then record it here so the publisher sees it.
      </p>

      <section className="card table-wrap">
        <h2>Balances owed ({owed.length})</h2>
        <table>
          <thead><tr><th>Publisher</th><th>Payment details</th><th className="num">Approved</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Pending</th><th>Record payment</th></tr></thead>
          <tbody>
            {owed.map((r) => (
              <tr key={r.publisher_id}>
                <td><Link href={`/admin/publishers/${r.publisher_id}`}>{r.name}</Link></td>
                <td className="wrap">{r.payout_method ? <><strong>{r.payout_method}</strong><div className="muted mono">{r.payout_details}</div></> : <span className="error">Not provided</span>}</td>
                <td className="num">{money(r.approved)}</td>
                <td className="num">{money(r.paid)}</td>
                <td className="num"><strong>{money(r.balance)}</strong></td>
                <td className="num muted">{money(r.pending)}</td>
                <td><RecordPayment publisherId={r.publisher_id} amount={r.balance} method={r.payout_method} /></td>
              </tr>
            ))}
            {owed.length === 0 && <tr><td colSpan={7} className="muted">No outstanding balances.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h2>Recent payments</h2>
        <table>
          <thead><tr><th>Date</th><th>Publisher</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {recent.map((p) => (
              <tr key={p.id}>
                <td>{dateTime(p.paid_at)}</td>
                <td><Link href={`/admin/publishers/${p.publisher_id}`}>{p.name}</Link></td>
                <td>{p.method}</td>
                <td className="mono">{p.reference}</td>
                <td className="num">{money(p.amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} className="muted">No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
