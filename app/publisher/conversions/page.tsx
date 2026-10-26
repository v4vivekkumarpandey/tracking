import Link from 'next/link';
import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';

const STATUSES = ['pending', 'approved', 'rejected'] as const;

// Publishers see their payout only: never revenue, visitor IP, the
// advertiser's order ID, or anything about other publishers.
export default async function PublisherConversions(props: { searchParams: Promise<{ status?: string }> }) {
  const me = await requirePublisher();
  const sp = await props.searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const rows = await q<{ id: number; created_at: Date; offer_id: number; offer: string; goal: string; sub1: string; sub2: string; payout: string; status: string; reject_reason: string | null }>(
    `SELECT c.id, c.created_at, c.offer_id, o.name AS offer, c.goal, c.sub1, c.sub2, c.payout, c.status, c.reject_reason
     FROM conversions c JOIN offers o ON o.id = c.offer_id
     WHERE c.publisher_id = ? AND (? IS NULL OR c.status = ?)
     ORDER BY c.id DESC LIMIT 500`,
    [me.publisherId, status, status],
  );

  return (
    <>
      <div className="crumb">Reporting</div>
      <div className="title-row"><h1>Conversions</h1><a href={`/export/publisher/conversions${status ? `?status=${status}` : ''}`} className="button secondary-button">Download CSV (30 days)</a></div>
      <div className="tabs">
        <Link href="/publisher/conversions" className={!status ? 'active' : undefined}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/publisher/conversions?status=${s}`} className={status === s ? 'active' : undefined}>{s}</Link>)}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>ID</th><th>When</th><th>Offer</th><th>Event</th><th>sub1</th><th>sub2</th><th className="num">Payout</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{dateTime(c.created_at)}</td>
                <td><Link href={`/publisher/offers/${c.offer_id}`}>{c.offer}</Link></td>
                <td>{c.goal || 'default'}</td>
                <td className="mono">{c.sub1}</td>
                <td className="mono">{c.sub2}</td>
                <td className="num">{money(c.payout)}</td>
                <td><span className={`badge ${c.status}`}>{c.status}</span>{c.reject_reason && <div className="muted">{c.reject_reason}</div>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">No conversions yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">Latest 500. Pending conversions become payable once the advertiser approves them.</p>
    </>
  );
}
