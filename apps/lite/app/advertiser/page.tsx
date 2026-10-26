import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { topOffers } from '@/lib/dashboard';
import { OffersTable } from '../_components/OffersTable';
import { StatsOverview } from '../_components/StatsOverview';

export default async function AdvertiserDashboard() {
  const me = await requireAdvertiser();
  const scope = { kind: 'advertiser', id: me.advertiserId } as const;
  const [offers, [counts]] = await Promise.all([
    topOffers(new Date(), 10, scope),
    q<{ pending: string; offers: string }>(
      `SELECT (SELECT COUNT(*) FROM conversions c JOIN offers o ON o.id = c.offer_id WHERE o.advertiser_id = ? AND c.status = 'pending') AS pending,
              (SELECT COUNT(*) FROM offers WHERE advertiser_id = ? AND status = 'pending') AS offers`,
      [me.advertiserId, me.advertiserId],
    ),
  ]);
  const pending = Number(counts.pending);
  const pendingOffers = Number(counts.offers);

  return (
    <>
      <div className="crumb">Dashboard</div>
      <h1>Campaign overview</h1>
      <div className="greeting">
        Hi <strong>{me.name}</strong>. <Link href="/advertiser/integration">Integration guide</Link> · <Link href="/advertiser/offers/new">Submit a new offer</Link>
        <span className="muted"> All figures in UTC.</span>
      </div>
      {(pending > 0 || pendingOffers > 0) && (
        <div className="banner" role="status">
          {pending > 0 && <Link href="/advertiser/conversions?status=pending">{pending} conversion{pending === 1 ? '' : 's'} to review (approve or reject)</Link>}
          {pending > 0 && pendingOffers > 0 && <span> · </span>}
          {pendingOffers > 0 && <span>{pendingOffers} offer{pendingOffers === 1 ? '' : 's'} waiting for our approval</span>}
        </div>
      )}

      <StatsOverview
        scope={scope}
        cards={[
          { metric: 'clicks', title: 'Clicks' },
          { metric: 'conversions', title: 'Conversions' },
          { metric: 'cvr', title: 'CVR' },
          { metric: 'revenue', title: 'Cost' },
        ]}
        chartMetrics={['revenue', 'conversions', 'clicks']}
        labels={{ revenue: 'Cost' }}
      />

      <OffersTable
        rows={offers}
        cols={['revenue']}
        labels={{ revenue: 'Cost' }}
        hrefBase="/advertiser/offers"
        empty={<>No offers yet. <Link href="/advertiser/offers/new">Submit your first offer</Link>.</>}
        note="Cost = what you pay us for non-rejected conversions."
      />
    </>
  );
}
