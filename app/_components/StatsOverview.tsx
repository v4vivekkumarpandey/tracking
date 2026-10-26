import { delta, loadMonths, value, type Day, type Metric, type Scope } from '@/lib/dashboard';
import { CURRENCY } from '@/lib/format';
import { fmtMetric } from '@/lib/fmt';
import { KpiCard } from './KpiCard';
import { PerformanceChart } from './PerformanceChart';

const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
const dayLabel = (d: Day) => new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** KPI cards + month-vs-month chart for one scope (admin, a publisher, or an advertiser). */
export async function StatsOverview({ scope, cards, chartMetrics, labels }: {
  scope: Scope;
  cards: { metric: Metric; title: string }[];
  chartMetrics: Metric[];
  labels?: Partial<Record<Metric, string>>;
}) {
  const now = new Date();
  const months = await loadMonths(now, scope);
  const { current, last, today } = months;
  const mtd = current.slice(0, today + 1);
  const lastSame = last.slice(0, Math.min(today + 1, last.length));
  const yesterday = months.day(new Date(now.getTime() - 86_400_000));
  const fmt = (m: Metric, v: number) => fmtMetric(m, v, CURRENCY);

  return (
    <>
      <div className="kpis">
        {cards.map(({ metric, title }) => (
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
        lastLabel={monthName(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))}
        metrics={chartMetrics}
        labels={labels}
      />
    </>
  );
}
