import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';
import { approveConversions, rejectConversions } from '../actions';
import { SelectAll } from './SelectAll';

const STATUSES = ['pending', 'approved', 'rejected'] as const;

// Advertisers see their own offers' conversions with their order IDs and
// cost. Publishers are shown only as "Publisher #id" (identities and
// payouts stay private).
export default async function AdvertiserConversions(props: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireAdvertiser();
  const sp = await props.searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const rows = await q<{ id: number; created_at: Date; offer_id: number; offer: string; publisher_id: number; goal: string; txn_id: string; amount: string; revenue: string; status: string; reject_reason: string | null; approved_by: string | null; auto_at: Date | null }>(
    `SELECT c.id, c.created_at, c.offer_id, o.name AS offer, c.publisher_id, c.goal, c.txn_id, c.amount, c.revenue, c.status, c.reject_reason,
            c.approved_by, IF(o.auto_approve_days IS NULL OR c.fraud_score >= 70, NULL, c.created_at + INTERVAL o.auto_approve_days DAY) AS auto_at
     FROM conversions c JOIN offers o ON o.id = c.offer_id
     WHERE o.advertiser_id = ? AND (? IS NULL OR c.status = ?)
     ORDER BY c.id DESC LIMIT 500`,
    [me.advertiserId, status, status],
  );

  return (
    <>
      <div className="crumb">Reporting</div>
      <div className="title-row"><h1>Conversions</h1><a href={`/export/advertiser/conversions${status ? `?status=${status}` : ''}`} className="button secondary-button">Download CSV (30 days)</a></div>
      <div className="tabs">
        <Link href="/advertiser/conversions" className={!status ? 'active' : undefined}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/advertiser/conversions?status=${s}`} className={status === s ? 'active' : undefined}>{s}</Link>)}
      </div>
      <form action={approveConversions} className="card table-wrap" id="review">
        <div className="row bulk-bar">
          <span className="muted">Selected:</span>
          <button className="small" formAction={approveConversions}>Approve</button>
          <input name="reason" placeholder="Reject reason (e.g. refunded)" maxLength={255} style={{ width: 220 }} />
          <button className="danger small" formAction={rejectConversions}>Reject</button>
          <span className="muted">Rejected conversions are not paid.</span>
        </div>
        <table>
          <thead>
            <tr>
              <th><SelectAll form="review" /></th><th>ID</th><th>When</th><th>Offer</th><th>Event</th><th>Order ID</th>
              <th>Publisher</th><th className="num">Sale</th><th className="num">Cost</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" name="ids" value={c.id} aria-label={`Select conversion ${c.id}`} /></td>
                <td>{c.id}</td>
                <td>{dateTime(c.created_at)}</td>
                <td><Link href={`/advertiser/offers/${c.offer_id}`}>{c.offer}</Link></td>
                <td>{c.goal || 'default'}</td>
                <td className="mono">{c.txn_id}</td>
                <td>Publisher #{c.publisher_id}</td>
                <td className="num">{money(c.amount)}</td>
                <td className="num">{money(c.revenue)}</td>
                <td>
                  <span className={`badge ${c.status}`}>{c.status}</span>
                  {c.status === 'approved' && c.approved_by === 'auto' && <span className="muted"> (auto)</span>}
                  {c.status === 'pending' && c.auto_at && <div className="muted">auto-approves {dateTime(c.auto_at)}</div>}
                  {c.reject_reason && <div className="muted">{c.reject_reason}</div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="muted">No conversions.</td></tr>}
          </tbody>
        </table>
      </form>
      <p className="muted">Latest 500. Reject returns, cancellations and invalid leads with a reason. Publishers see the reason.</p>
    </>
  );
}
