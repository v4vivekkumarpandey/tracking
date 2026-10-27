import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { ALL, topOffers } from '@/lib/dashboard';
import { pendingCounts } from '@/lib/queue';
import { sourceLabel } from '@/lib/sourceLabels';
import { OffersTable } from '../_components/OffersTable';
import { StatsOverview } from '../_components/StatsOverview';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function Dashboard() {
  const email = await requireAdmin();
  const [offers, pending, [attention], risky, disallowed] = await Promise.all([
    topOffers(new Date(), 10, ALL),
    pendingCounts(),
    q<{ conv: string; failed: string; active: string }>(
      `SELECT (SELECT COUNT(*) FROM conversions WHERE status = 'pending') AS conv,
              (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed,
              (SELECT COUNT(*) FROM offers WHERE status = 'active') AS active`,
    ),
    q<{ publisher_id: number; name: string; held: number; total: number; avg_score: string; reason: string | null }>(
      `SELECT c.publisher_id, p.name, SUM(c.fraud_score >= 70) AS held, COUNT(*) AS total, AVG(c.fraud_score) AS avg_score,
              SUBSTRING_INDEX(MAX(CASE WHEN c.fraud_score >= 70 THEN CONCAT(LPAD(c.fraud_score, 3, '0'), '|', c.fraud_reasons) END), '|', -1) AS reason
       FROM conversions c JOIN publishers p ON p.id = c.publisher_id
       WHERE c.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
       GROUP BY c.publisher_id, p.name HAVING held > 0 ORDER BY held DESC LIMIT 10`,
    ),
    q<{ publisher_id: number; publisher: string; offer_id: number; offer: string; traffic_source: string; n: number; pending: number }>(
      `SELECT c.publisher_id, p.name AS publisher, c.offer_id, o.name AS offer, c.traffic_source,
              COUNT(*) AS n, SUM(c.status = 'pending') AS pending
       FROM conversions c JOIN publishers p ON p.id = c.publisher_id JOIN offers o ON o.id = c.offer_id
       WHERE c.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND c.fraud_reasons LIKE '%disallowed traffic source%'
       GROUP BY c.publisher_id, p.name, c.offer_id, o.name, c.traffic_source ORDER BY n DESC LIMIT 20`,
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
          { metric: 'margin', title: 'Profit' },
        ]}
        chartMetrics={['revenue', 'payout', 'margin', 'conversions', 'clicks']}
      />

      {risky.length > 0 && (
        <section className="card table-wrap">
          <h2>High-risk publishers (last 7 days)</h2>
          <p className="muted">Publishers with conversions scored 70+ by fraud detection. Those conversions are held: never auto-approved, and flagged for the advertiser.</p>
          <table>
            <thead><tr><th>Publisher</th><th className="num">Held conversions</th><th className="num">All conversions</th><th className="num">Avg score</th><th>Top reason</th></tr></thead>
            <tbody>
              {risky.map((r) => (
                <tr key={r.publisher_id}>
                  <td><Link href={`/admin/publishers/${r.publisher_id}`}>{r.name}</Link></td>
                  <td className="num error">{r.held}</td>
                  <td className="num">{r.total}</td>
                  <td className="num">{Math.round(Number(r.avg_score))}</td>
                  <td className="wrap muted">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {disallowed.length > 0 && (
        <section className="card table-wrap">
          <h2>Disallowed traffic (last 7 days)</h2>
          <p className="muted">Conversions from traffic sources the offer does not allow. They are held for review and never auto-approved.</p>
          <table>
            <thead><tr><th>Publisher</th><th>Offer</th><th>Source</th><th className="num">Conversions</th><th className="num">Still pending</th></tr></thead>
            <tbody>
              {disallowed.map((r) => (
                <tr key={`${r.publisher_id}-${r.offer_id}-${r.traffic_source}`}>
                  <td><Link href={`/admin/publishers/${r.publisher_id}`}>{r.publisher}</Link></td>
                  <td><Link href={`/admin/offers/${r.offer_id}`}>{r.offer}</Link></td>
                  <td>{sourceLabel(r.traffic_source)}</td>
                  <td className="num error">{r.n}</td>
                  <td className="num">{Number(r.pending) ? <Link href="/admin/conversions?status=pending">{r.pending}</Link> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
