import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { delta, loadMonths, topOffers, value, type Day, type Metric } from '@/lib/dashboard';
import { CURRENCY } from '@/lib/format';
import { fmtMetric } from '@/lib/fmt';
import { KpiCard } from './_components/KpiCard';
import { PerformanceChart } from './_components/PerformanceChart';

const CARDS: { metric: Metric; title: string }[] = [
  { metric: 'clicks', title: 'Clicks' },
  { metric: 'conversions', title: 'Conversions' },
  { metric: 'cvr', title: 'CVR' },
  { metric: 'revenue', title: 'Revenue' },
  { metric: 'payout', title: 'Payout' },
  { metric: 'margin', title: 'Margin' },
];

const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

export default async function Dashboard() {
  const email = await requireAdmin();
  const now = new Date();
  const [months, offers, [attention]] = await Promise.all([
    loadMonths(now),
    topOffers(now),
    q<{ pending: number; failed: number; active: number }>(
      `SELECT (SELECT COUNT(*) FROM conversions WHERE status = 'pending') AS pending,
              (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed,
              (SELECT COUNT(*) FROM offers WHERE status = 'active') AS active`,
    ),
  ]);

  const { current, last, today } = months;
  const mtd = current.slice(0, today + 1);
  const lastSame = last.slice(0, Math.min(today + 1, last.length));
  const yesterday = months.day(new Date(now.getTime() - 86_400_000));
  const fmt = (m: Metric, v: number) => fmtMetric(m, v, CURRENCY);
  const dayLabel = (d: Day) => new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const pending = Number(attention.pending);
  const failed = Number(attention.failed);
  const active = Number(attention.active);
  const lastMonthLabel = monthName(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

  return (
    <>
      <div className="crumb">Dashboard</div>
      <h1>Overview</h1>

      <div className="greeting">
        Hi <strong>{email.split('@')[0]}</strong>, you have{' '}
        <Link href="/admin/offers">{active} active offer{active === 1 ? '' : 's'}</Link>.
        <span className="muted"> All figures in UTC.</span>
      </div>

      {(pending > 0 || failed > 0) && (
        <div className="banner" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
          </svg>
          {pending > 0 && <Link href="/admin/conversions?status=pending">{pending} conversion{pending === 1 ? '' : 's'} waiting for review</Link>}
          {pending > 0 && failed > 0 && <span> · </span>}
          {failed > 0 && <span>{failed} publisher postback{failed === 1 ? '' : 's'} failed after all retries</span>}
        </div>
      )}

      <div className="kpis">
        {CARDS.map(({ metric, title }) => (
          <KpiCard
            key={metric}
            title={title}
            value={fmt(metric, value(mtd, metric))}
            delta={delta(value(mtd, metric), value(lastSame, metric))}
            spark={mtd.map((d) => ({ label: dayLabel(d), value: value([d], metric), text: fmt(metric, value([d], metric)) }))}
            rows={[
              ['Today', fmt(metric, value([current[today]], metric))],
              ['Yesterday', fmt(metric, value([yesterday], metric))],
              ['Last month', fmt(metric, value(last, metric))],
            ]}
          />
        ))}
      </div>

      <PerformanceChart
        current={current}
        last={last}
        today={today}
        currency={CURRENCY}
        currentLabel={`${monthName(now)} (to date)`}
        lastLabel={lastMonthLabel}
      />

      <section className="card table-wrap">
        <h2>Offers this month</h2>
        <table className="offers-table">
          <thead>
            <tr>
              <th>Offer</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th>
              <th className="num">Revenue</th><th className="num">Payout</th><th className="num">Margin</th><th className="num">EPC</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/offers/${o.id}`}>{o.name}</Link></td>
                <td className="num">{fmt('clicks', o.clicks)}</td>
                <td className="num">{fmt('conversions', o.conversions)}</td>
                <td className="num">{o.clicks ? fmt('cvr', (o.conversions / o.clicks) * 100) : '–'}</td>
                <td className="num">{fmt('revenue', o.revenue)}</td>
                <td className="num">{fmt('payout', o.payout)}</td>
                <td className="num">{fmt('margin', o.revenue - o.payout)}</td>
                <td className="num">{o.clicks ? fmt('payout', o.payout / o.clicks) : '–'}</td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr><td colSpan={8} className="muted">No offers yet. <Link href="/admin/offers">Create one</Link>.</td></tr>
            )}
          </tbody>
        </table>
        <p className="muted">EPC = publisher earnings per click. Rejected conversions are excluded.</p>
      </section>
    </>
  );
}
