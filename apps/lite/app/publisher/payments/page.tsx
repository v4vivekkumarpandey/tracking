import Link from 'next/link';
import { requirePublisher } from '@/lib/auth';
import { balances, paymentHistory } from '@/lib/balance';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';

export default async function PublisherPayments() {
  const me = await requirePublisher();
  const [[bal], history, [acct]] = await Promise.all([
    balances(me.publisherId),
    paymentHistory(me.publisherId),
    q<{ payout_method: string | null }>(`SELECT payout_method FROM publishers WHERE id = ?`, [me.publisherId]),
  ]);

  return (
    <>
      <div className="crumb">Account</div>
      <div className="title-row"><h1>Payments</h1><a href="/export/publisher/payments" className="button secondary-button">Download CSV</a></div>
      {!acct?.payout_method && (
        <div className="banner">Add a payment method in <Link href="/publisher/account">Settings</Link> so we can pay you.</div>
      )}
      <div className="kpis">
        <Tile label="Balance (ready to pay)" value={money(bal?.balance ?? 0)} />
        <Tile label="Pending approval" value={money(bal?.pending ?? 0)} />
        <Tile label="Approved all-time" value={money(bal?.approved ?? 0)} />
        {!!bal?.referral && <Tile label="Referral commission" value={money(bal.referral)} />}
        <Tile label="Paid all-time" value={money(bal?.paid ?? 0)} />
      </div>
      <div className="card table-wrap">
        <h2>Payment history</h2>
        <table>
          <thead><tr><th>Date</th><th>Period</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{dateTime(h.paid_at)}</td>
                <td>{h.period_from && h.period_to ? `${iso(h.period_from)} – ${iso(h.period_to)}` : '–'}</td>
                <td>{h.method}</td>
                <td className="mono">{h.reference}</td>
                <td className="num">{money(h.amount)}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={5} className="muted">No payments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
