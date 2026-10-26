import Link from 'next/link';
import { requirePublisher } from '@/lib/auth';
import { balances } from '@/lib/balance';
import { topOffers } from '@/lib/dashboard';
import { money } from '@/lib/format';
import { OffersTable } from '../_components/OffersTable';
import { StatsOverview } from '../_components/StatsOverview';

export default async function PublisherDashboard() {
  const me = await requirePublisher();
  const scope = { kind: 'publisher', id: me.publisherId } as const;
  const [offers, [bal]] = await Promise.all([topOffers(new Date(), 10, scope), balances(me.publisherId)]);

  return (
    <>
      <div className="crumb">Dashboard</div>
      <h1>My stats</h1>
      <div className="greeting">
        Hi <strong>{me.name}</strong>. Balance <strong>{money(bal?.balance ?? 0)}</strong>
        {bal && bal.pending > 0 && <span className="muted"> · {money(bal.pending)} pending approval</span>}.{' '}
        <Link href="/publisher/offers">Find offers to promote →</Link>
        <span className="muted"> All figures in UTC.</span>
      </div>

      <StatsOverview
        scope={scope}
        cards={[
          { metric: 'clicks', title: 'Clicks' },
          { metric: 'conversions', title: 'Conversions' },
          { metric: 'cvr', title: 'CVR' },
          { metric: 'payout', title: 'Earnings' },
          { metric: 'epc', title: 'EPC' },
        ]}
        chartMetrics={['payout', 'conversions', 'clicks']}
        labels={{ payout: 'Earnings' }}
      />

      <OffersTable
        rows={offers}
        cols={['payout', 'epc']}
        labels={{ payout: 'Earnings' }}
        hrefBase="/publisher/offers"
        empty={<>You aren&apos;t running any offers yet. <Link href="/publisher/offers">Browse offers</Link>.</>}
        note="EPC = earnings per click. Rejected conversions are excluded."
      />
    </>
  );
}
