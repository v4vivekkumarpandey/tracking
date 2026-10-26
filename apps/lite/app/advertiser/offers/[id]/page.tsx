import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, money, pct, trackingBase } from '@/lib/format';

export default async function AdvertiserOffer(props: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const me = await requireAdvertiser();
  const oid = Number((await props.params).id);
  const sp = await props.searchParams;
  if (!Number.isInteger(oid)) notFound();
  const [o] = await q<{ id: number; name: string; description: string | null; destination_url: string; payout_model: string; default_revenue: string; revenue_percent: string | null; attribution_days: number; status: string; secret: string }>(
    `SELECT o.id, o.name, o.description, o.destination_url, o.payout_model, o.default_revenue, o.revenue_percent,
            o.attribution_days, o.status, a.postback_secret AS secret
     FROM offers o JOIN advertisers a ON a.id = o.advertiser_id WHERE o.id = ? AND o.advertiser_id = ?`,
    [oid, me.advertiserId],
  );
  if (!o) notFound();

  const [[stats], goals] = await Promise.all([
    q<{ clicks: string; conversions: string; cost: string }>(
      `SELECT (SELECT COALESCE(SUM(clicks), 0) FROM stats_hourly WHERE offer_id = ? AND hour >= UTC_DATE() - INTERVAL 30 DAY) AS clicks,
              (SELECT COUNT(*) FROM conversions WHERE offer_id = ? AND status <> 'rejected' AND created_at >= UTC_DATE() - INTERVAL 30 DAY) AS conversions,
              (SELECT COALESCE(SUM(revenue), 0) FROM conversions WHERE offer_id = ? AND status <> 'rejected' AND created_at >= UTC_DATE() - INTERVAL 30 DAY) AS cost`,
      [oid, oid, oid],
    ),
    q<{ code: string; name: string; revenue: string | null }>(`SELECT code, name, revenue FROM offer_goals WHERE offer_id = ? ORDER BY code`, [oid]),
  ]);
  const base = trackingBase();

  return (
    <>
      <div className="crumb"><Link href="/advertiser/offers">Offers</Link></div>
      <h1>{o.name} <span className={`badge ${o.status}`}>{o.status === 'pending' ? 'in review' : o.status}</span></h1>
      {sp.submitted && <div className="card notice">Thanks! Your offer was submitted and is now in review. Meanwhile, set up conversion tracking below.</div>}

      <div className="kpis">
        <div className="stat"><div className="label">Clicks (30 days)</div><div className="value">{count(stats.clicks)}</div></div>
        <div className="stat"><div className="label">Conversions (30 days)</div><div className="value">{count(stats.conversions)}</div></div>
        <div className="stat"><div className="label">CVR</div><div className="value">{pct(Number(stats.conversions), Number(stats.clicks))}</div></div>
        <div className="stat"><div className="label">Cost (30 days)</div><div className="value">{money(stats.cost)}</div></div>
      </div>

      <div className="card stack">
        <div className="offer-meta">
          <div><span className="muted">You pay</span><strong>{o.revenue_percent ? `${Number(o.revenue_percent)}% of sale` : money(o.default_revenue)}</strong></div>
          <div><span className="muted">Model</span><strong>{o.payout_model}</strong></div>
          <div><span className="muted">Attribution</span><strong>{o.attribution_days} days</strong></div>
        </div>
        <div>Landing page: <code>{o.destination_url}</code></div>
        {o.description && <p className="wrap muted">{o.description}</p>}
        {goals.length > 0 && (
          <table>
            <thead><tr><th>Event</th><th>Code (send as &amp;goal=)</th><th className="num">You pay</th></tr></thead>
            <tbody>{goals.map((g) => <tr key={g.code}><td>{g.name}</td><td><code>{g.code}</code></td><td className="num">{g.revenue ? money(g.revenue) : 'offer price'}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2>Conversion tracking for this offer</h2>
        <p>When a conversion happens, call this URL from your server, using the <code>click_id</code> we added to your landing page URL:</p>
        <code className="link-out">{`${base}/postback?click_id={CLICK_ID}&secret=${o.secret}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}`}</code>
        <p className="muted">Full guide, pixel option and test log: <Link href="/advertiser/integration">Integration</Link>.</p>
      </div>
    </>
  );
}
