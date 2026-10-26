import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { CURRENCY, money, trackingBase } from '@/lib/format';
import { addGoal, approvePublisher, revokePublisher, setOfferStatus } from '../../actions';

type Offer = {
  id: number; name: string; advertiser: string; postback_secret: string;
  destination_url: string; payout_model: string; status: string; attribution_days: number;
  default_revenue: string; default_payout: string; revenue_percent: string | null; payout_percent: string | null;
};

export default async function OfferPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const oid = Number(params.id);
  if (!Number.isInteger(oid)) notFound();
  const [o] = await q<Offer>(
    `SELECT o.*, a.name AS advertiser, a.postback_secret FROM offers o
     JOIN advertisers a ON a.id = o.advertiser_id WHERE o.id = ?`, [oid],
  );
  if (!o) notFound();

  const [goals, access, publishers] = await Promise.all([
    q<{ code: string; name: string; revenue: string | null; payout: string | null }>(
      `SELECT code, name, revenue, payout FROM offer_goals WHERE offer_id = ? ORDER BY code`, [oid],
    ),
    q<{ publisher_id: number; name: string; status: string; payout_override: string | null; code: string | null }>(
      `SELECT a.publisher_id, p.name, a.status, a.payout_override, l.code
       FROM publisher_offer_access a
       JOIN publishers p ON p.id = a.publisher_id
       LEFT JOIN tracking_links l ON l.offer_id = a.offer_id AND l.publisher_id = a.publisher_id
       WHERE a.offer_id = ? ORDER BY p.name`, [oid],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM publishers WHERE status = 'active' ORDER BY name`),
  ]);

  const base = trackingBase();
  const s2s = `${base}/postback?click_id={CLICK_ID}&secret=${o.postback_secret}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}&goal=`;
  const pixel = `<img src="${base}/px?click_id={CLICK_ID}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}" width="1" height="1" alt="" />`;

  return (
    <>
      <h1>{o.name} <span className={`badge ${o.status}`}>{o.status}</span></h1>

      <div className="card stack">
        <div className="row">
          <span>Advertiser: <strong>{o.advertiser}</strong></span>
          <span>Model: <strong>{o.payout_model}</strong></span>
          <span>Revenue: <strong>{o.revenue_percent ? `${o.revenue_percent}% of sale` : money(o.default_revenue)}</strong></span>
          <span>Payout: <strong>{o.payout_percent ? `${o.payout_percent}% of sale` : money(o.default_payout)}</strong></span>
          <span>Attribution: <strong>{o.attribution_days} days</strong></span>
        </div>
        <div>Destination: <code>{o.destination_url}</code></div>
        <div className="row">
          {(['active', 'paused', 'archived'] as const).filter((s) => s !== o.status).map((s) => (
            <form key={s} action={setOfferStatus} className="inline">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="status" value={s} />
              <button className={s === 'active' ? 'small' : 'secondary small'}>
                {s === 'active' ? 'Activate' : s === 'paused' ? 'Pause' : 'Archive'}
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>Give this to the advertiser</h2>
        <p className="muted">
          The advertiser stores our <code>click_id</code> from the landing page URL and calls this when a sale or lead happens.
          Replace the {'{CAPS}'} parts with their own values.
        </p>
        <div>Server-to-server postback (recommended):</div>
        <code>{s2s}</code>
        <div>Browser pixel (fallback, less reliable):</div>
        <code>{pixel}</code>
      </div>

      <div className="card">
        <h2>Publishers</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Publisher</th><th>Status</th><th className="num">Payout override</th><th>Tracking link</th><th></th></tr></thead>
            <tbody>
              {access.map((a) => (
                <tr key={a.publisher_id}>
                  <td><Link href={`/admin/publishers/${a.publisher_id}`}>{a.name}</Link></td>
                  <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                  <td className="num">{a.payout_override ? money(a.payout_override) : '–'}</td>
                  <td>{a.code ? <code>{base}/c/{a.code}?sub1=</code> : '–'}</td>
                  <td>
                    {a.status === 'approved' && (
                      <form action={revokePublisher} className="inline">
                        <input type="hidden" name="offer_id" value={o.id} />
                        <input type="hidden" name="publisher_id" value={a.publisher_id} />
                        <button className="danger small">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={approvePublisher} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="offer_id" value={o.id} />
          <label>Publisher
            <select name="publisher_id" required>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Payout override ({CURRENCY}, optional)<input name="payout_override" inputMode="decimal" /></label>
          <button type="submit">Approve &amp; create link</button>
        </form>
      </div>

      <div className="card">
        <h2>Goals</h2>
        <p className="muted">
          Extra events with their own price, sent as <code>&amp;goal=code</code>. A postback without a goal uses the offer defaults.
        </p>
        <table>
          <thead><tr><th>Code</th><th>Name</th><th className="num">Revenue</th><th className="num">Payout</th></tr></thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.code}>
                <td><code>{g.code}</code></td>
                <td>{g.name}</td>
                <td className="num">{g.revenue ? money(g.revenue) : 'offer default'}</td>
                <td className="num">{g.payout ? money(g.payout) : 'offer default'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addGoal} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="offer_id" value={o.id} />
          <label>Code<input name="code" required placeholder="lead" /></label>
          <label>Name<input name="name" placeholder="Signup" /></label>
          <label>Revenue ({CURRENCY})<input name="revenue" inputMode="decimal" /></label>
          <label>Payout ({CURRENCY})<input name="payout" inputMode="decimal" /></label>
          <button type="submit">Save goal</button>
        </form>
      </div>
    </>
  );
}
