import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, money } from '@/lib/format';

type Offer = {
  id: number; name: string; advertiser: string; payout_model: string; status: string; visibility: string;
  default_revenue: string; default_payout: string; revenue_percent: string | null; payout_percent: string | null;
  publishers: number; clicks: string; conversions: string;
};

const TABS = ['all', 'active', 'pending', 'paused', 'archived'] as const;
type Tab = (typeof TABS)[number];

export default async function Offers(props: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await props.searchParams;
  const tab: Tab = TABS.find((t) => t === sp.status) ?? 'all';
  const search = (sp.q ?? '').trim().slice(0, 100);

  const [offers, counts] = await Promise.all([
    q<Offer>(
      `SELECT o.id, o.name, a.name AS advertiser, o.payout_model, o.status, o.visibility,
              o.default_revenue, o.default_payout, o.revenue_percent, o.payout_percent,
              (SELECT COUNT(*) FROM publisher_offer_access x WHERE x.offer_id = o.id AND x.status = 'approved') AS publishers,
              (SELECT COALESCE(SUM(s.clicks), 0) FROM stats_hourly s WHERE s.offer_id = o.id AND s.hour >= UTC_DATE() - INTERVAL 30 DAY) AS clicks,
              (SELECT COUNT(*) FROM conversions c WHERE c.offer_id = o.id AND c.status <> 'rejected' AND c.created_at >= UTC_DATE() - INTERVAL 30 DAY) AS conversions
       FROM offers o JOIN advertisers a ON a.id = o.advertiser_id
       WHERE (? = 'all' OR o.status = ?)
         AND (? = '' OR o.name LIKE CONCAT('%', ?, '%') OR a.name LIKE CONCAT('%', ?, '%') OR o.id = ?)
       ORDER BY o.status = 'pending' DESC, o.status = 'archived', o.id DESC`,
      [tab, tab, search, search, search, Number(search) || 0],
    ),
    q<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM offers GROUP BY status`),
  ]);
  const n = (t: Tab) => (t === 'all' ? counts.reduce((s, c) => s + Number(c.n), 0) : Number(counts.find((c) => c.status === t)?.n ?? 0));
  const qs = (t: Tab) => `/admin/offers?status=${t}${search ? `&q=${encodeURIComponent(search)}` : ''}`;

  return (
    <>
      <div className="crumb">Manage</div>
      <div className="title-row">
        <h1>Offers</h1>
        <div className="row">
          <Link href="/admin/offers/import" className="button secondary-button">Import / Export</Link>
          <Link href="/admin/offers/new" className="button">+ New offer</Link>
        </div>
      </div>

      <form className="card row" role="search">
        <input type="hidden" name="status" value={tab} />
        <input name="q" defaultValue={search} placeholder="Search by offer, advertiser or ID" aria-label="Search offers" style={{ flex: 1, minWidth: 220 }} />
        <button type="submit">Search</button>
        {search && <Link href={`/admin/offers?status=${tab}`}>Clear</Link>}
      </form>

      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t} href={qs(t)} className={t === tab ? 'active' : undefined}>
            {t} <span className="muted">({n(t)})</span>
          </Link>
        ))}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Offer</th><th>Advertiser</th><th>Model</th><th className="num">Revenue</th><th className="num">Payout</th>
              <th className="num">Publishers</th><th className="num">Clicks 30d</th><th className="num">Conv. 30d</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const loss = !o.revenue_percent && !o.payout_percent && Number(o.default_payout) > Number(o.default_revenue);
              return (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>
                    <Link href={`/admin/offers/${o.id}`}>{o.name}</Link>
                    {o.visibility === 'private' && <span className="muted"> · private</span>}
                  </td>
                  <td>{o.advertiser}</td>
                  <td>{o.payout_model}</td>
                  <td className="num">{o.revenue_percent ? `${Number(o.revenue_percent)}%` : money(o.default_revenue)}</td>
                  <td className={`num${loss ? ' error' : ''}`} title={loss ? 'Payout is higher than revenue: you lose money on every conversion' : undefined}>
                    {o.payout_percent ? `${Number(o.payout_percent)}%` : money(o.default_payout)}{loss && ' ⚠'}
                  </td>
                  <td className="num">{o.publishers}</td>
                  <td className="num">{count(o.clicks)}</td>
                  <td className="num">{count(o.conversions)}</td>
                  <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                </tr>
              );
            })}
            {offers.length === 0 && (
              <tr><td colSpan={10} className="muted">No offers found. <Link href="/admin/offers/new">Create one</Link>.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
