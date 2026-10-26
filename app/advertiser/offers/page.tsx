import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';

export default async function AdvertiserOffers() {
  const me = await requireAdvertiser();
  const offers = await q<{ id: number; name: string; payout_model: string; default_revenue: string; revenue_percent: string | null; status: string; created_at: Date; publishers: number }>(
    `SELECT o.id, o.name, o.payout_model, o.default_revenue, o.revenue_percent, o.status, o.created_at,
            (SELECT COUNT(*) FROM publisher_offer_access a WHERE a.offer_id = o.id AND a.status = 'approved') AS publishers
     FROM offers o WHERE o.advertiser_id = ? ORDER BY o.status = 'archived', o.id DESC`,
    [me.advertiserId],
  );
  return (
    <>
      <div className="crumb">Manage</div>
      <div className="title-row">
        <h1>Offers</h1>
        <Link href="/advertiser/offers/new" className="button">Submit new offer</Link>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Offer</th><th>Model</th><th className="num">You pay</th><th className="num">Publishers</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td><Link href={`/advertiser/offers/${o.id}`}>{o.name}</Link></td>
                <td>{o.payout_model}</td>
                <td className="num">{o.revenue_percent ? `${Number(o.revenue_percent)}% of sale` : money(o.default_revenue)}</td>
                <td className="num">{o.publishers}</td>
                <td><span className={`badge ${o.status}`}>{o.status === 'pending' ? 'in review' : o.status}</span></td>
                <td>{dateTime(o.created_at)}</td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={7} className="muted">No offers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">To change pricing or pause an offer, contact us. Changes are reviewed so publishers are never surprised.</p>
    </>
  );
}
