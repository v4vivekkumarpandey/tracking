import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ALL, topOffers } from '@/lib/dashboard';
import { pendingCounts } from '@/lib/queue';
import { OffersTable } from '../_components/OffersTable';
import { StatsOverview } from '../_components/StatsOverview';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function Dashboard() {
  const email = await requireAdmin();
  const [offers, pending, [attention]] = await Promise.all([
    topOffers(new Date(), 10, ALL),
    pendingCounts(),
    q<{ conv: string; failed: string; active: string }>(
      `SELECT (SELECT COUNT(*) FROM conversions WHERE status = 'pending') AS conv,
              (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed,
              (SELECT COUNT(*) FROM offers WHERE status = 'active') AS active`,
    ),
  ]);
  const conv = Number(attention.conv);
  const failed = Number(attention.failed);
  const active = Number(attention.active);

  const items: React.ReactNode[] = [];
  if (pending.total) {
    const parts = [
      pending.publishers && plural(pending.publishers, 'publisher'),
      pending.advertisers && plural(pending.advertisers, 'advertiser'),
      pending.access && plural(pending.access, 'offer access request'),
      pending.offers && plural(pending.offers, 'submitted offer'),
    ].filter(Boolean);
    items.push(<Link key="req" href="/admin/requests">Waiting for approval: {parts.join(', ')}</Link>);
  }
  if (conv) items.push(<Link key="conv" href="/admin/conversions?status=pending">{plural(conv, 'conversion')} to review</Link>);
  if (failed) items.push(<span key="failed">{plural(failed, 'publisher postback')} failed after all retries</span>);

  return (
    <>
      <div className="crumb">Dashboard</div>
      <h1>Overview</h1>

      <div className="greeting">
        Hi <strong>{email.split('@')[0]}</strong>, you have{' '}
        <Link href="/admin/offers">{plural(active, 'active offer')}</Link>.
        <span className="muted"> All figures in UTC.</span>
      </div>

      {items.length > 0 && (
        <div className="banner" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
          </svg>
          {items.flatMap((it, i) => (i ? [<span key={`s${i}`}> · </span>, it] : [it]))}
        </div>
      )}

      <StatsOverview
        scope={ALL}
        cards={[
          { metric: 'clicks', title: 'Clicks' },
          { metric: 'conversions', title: 'Conversions' },
          { metric: 'cvr', title: 'CVR' },
          { metric: 'revenue', title: 'Revenue' },
          { metric: 'payout', title: 'Payout' },
          { metric: 'margin', title: 'Margin' },
        ]}
        chartMetrics={['revenue', 'payout', 'margin', 'conversions', 'clicks']}
      />

      <OffersTable
        rows={offers}
        cols={['revenue', 'payout', 'margin', 'epc']}
        hrefBase="/admin/offers"
        empty={<>No offers yet. <Link href="/admin/offers">Create one</Link>.</>}
        note="EPC = publisher earnings per click. Rejected conversions are excluded."
      />
    </>
  );
}
