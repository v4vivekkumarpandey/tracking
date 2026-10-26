import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';
import { setConversionStatus } from '../actions';

type Conversion = {
  id: number; created_at: Date; click_time: Date; offer_id: number; offer: string;
  publisher_id: number; publisher: string; goal: string; txn_id: string; amount: string;
  revenue: string; payout: string; status: string; source: string; sub1: string; reject_reason: string | null;
};

const STATUSES = ['pending', 'approved', 'rejected'] as const;

export default async function Conversions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const rows = await q<Conversion>(
    `SELECT c.id, c.created_at, c.click_time, c.offer_id, o.name AS offer, c.publisher_id, p.name AS publisher,
            c.goal, c.txn_id, c.amount, c.revenue, c.payout, c.status, c.source, c.sub1, c.reject_reason
     FROM conversions c
     JOIN offers o ON o.id = c.offer_id
     JOIN publishers p ON p.id = c.publisher_id
     WHERE (? IS NULL OR c.status = ?)
     ORDER BY c.id DESC LIMIT 200`,
    [status, status],
  );

  return (
    <>
      <h1>Conversions</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link href="/admin/conversions">All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/conversions?status=${s}`}>{s}</Link>)}
        <span className="muted">Latest 200</span>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>When</th><th>Offer / Publisher</th><th>Goal · Txn</th>
              <th className="num">Sale</th><th className="num">Revenue</th><th className="num">Payout</th>
              <th>Source</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{dateTime(c.created_at)}<div className="muted">click {dateTime(c.click_time)}</div></td>
                <td>
                  <Link href={`/admin/offers/${c.offer_id}`}>{c.offer}</Link>
                  <div><Link href={`/admin/publishers/${c.publisher_id}`}>{c.publisher}</Link>{c.sub1 && <span className="muted"> · sub1 {c.sub1}</span>}</div>
                </td>
                <td>{c.goal || 'default'}<div className="muted mono">{c.txn_id}</div></td>
                <td className="num">{money(c.amount)}</td>
                <td className="num">{money(c.revenue)}</td>
                <td className="num">{money(c.payout)}</td>
                <td>{c.source}</td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                  {c.reject_reason && <div className="muted">{c.reject_reason}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.status !== 'approved' && (
                    <form action={setConversionStatus} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="small">Approve</button>
                    </form>
                  )}{' '}
                  {c.status !== 'rejected' && (
                    <form action={setConversionStatus} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <input name="reason" placeholder="reason" style={{ width: 90 }} />
                      <button className="danger small">Reject</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="muted">No conversions.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
