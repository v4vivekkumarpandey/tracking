import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { CURRENCY, money } from '@/lib/format';
import { createOffer } from '../actions';

type Offer = {
  id: number; name: string; advertiser: string; payout_model: string; status: string;
  default_revenue: string; default_payout: string; revenue_percent: string | null; payout_percent: string | null;
  publishers: number;
};

export default async function Offers() {
  await requireAdmin();
  const [offers, advertisers] = await Promise.all([
    q<Offer>(
      `SELECT o.id, o.name, a.name AS advertiser, o.payout_model, o.status,
              o.default_revenue, o.default_payout, o.revenue_percent, o.payout_percent,
              (SELECT COUNT(*) FROM publisher_offer_access x WHERE x.offer_id = o.id AND x.status = 'approved') AS publishers
       FROM offers o JOIN advertisers a ON a.id = o.advertiser_id
       ORDER BY o.status = 'archived', o.id DESC`,
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM advertisers ORDER BY name`),
  ]);

  return (
    <>
      <h1>Offers</h1>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Offer</th><th>Advertiser</th><th>Model</th><th className="num">Revenue</th><th className="num">Payout</th><th className="num">Publishers</th><th>Status</th></tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td><Link href={`/admin/offers/${o.id}`}>{o.name}</Link></td>
                <td>{o.advertiser}</td>
                <td>{o.payout_model}</td>
                <td className="num">{o.revenue_percent ? `${o.revenue_percent}%` : money(o.default_revenue)}</td>
                <td className="num">{o.payout_percent ? `${o.payout_percent}%` : money(o.default_payout)}</td>
                <td className="num">{o.publishers}</td>
                <td><span className={`badge ${o.status}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createOffer} className="card stack">
        <h2>New offer</h2>
        {advertisers.length === 0 && <p className="error">Add an advertiser first.</p>}
        <div className="row">
          <label style={{ flex: 1 }}>Name<input name="name" required /></label>
          <label>Advertiser
            <select name="advertiser_id" required>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>Model
            <select name="payout_model" defaultValue="CPA">
              <option>CPA</option><option>CPS</option><option>CPL</option><option>CPI</option>
            </select>
          </label>
          <label>Attribution days<input name="attribution_days" type="number" min={1} max={365} defaultValue={30} /></label>
        </div>
        <label>
          Destination URL (macros: {'{click_id} {pub_id} {offer_id} {sub1}…{sub5}'})
          <input name="destination_url" required placeholder="https://brand.example/?utm_source=network&click_id={click_id}" />
        </label>
        <div className="row">
          <label>Revenue per conversion ({CURRENCY})<input name="default_revenue" inputMode="decimal" /></label>
          <label>Payout per conversion ({CURRENCY})<input name="default_payout" inputMode="decimal" /></label>
          <label>or Revenue % of sale<input name="revenue_percent" inputMode="decimal" /></label>
          <label>or Payout % of sale<input name="payout_percent" inputMode="decimal" /></label>
        </div>
        <label>Description<textarea name="description" rows={2} /></label>
        <div><button type="submit">Create offer</button></div>
      </form>
    </>
  );
}
