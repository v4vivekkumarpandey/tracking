import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { chq } from '@/lib/ch';
import { q } from '@/lib/db';
import { count, money, pct } from '@/lib/format';

export default async function Overview() {
  await requireAdmin();
  const [clicks] = await chq<{ clicks: string; uniques: string; flagged: string }>(
    `SELECT sum(clicks) AS clicks, uniqMerge(unique_clicks) AS uniques, sum(flagged) AS flagged
     FROM stats_hourly WHERE hour >= toStartOfDay(now('UTC'))`,
  );
  const [conv] = await q<{ total: number; pending: number; revenue: string; payout: string }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            COALESCE(sum(revenue) FILTER (WHERE status <> 'rejected'), 0) AS revenue,
            COALESCE(sum(payout)  FILTER (WHERE status <> 'rejected'), 0) AS payout
     FROM conversions WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
  );
  const [health] = await q<{ pending_jobs: number; failed_jobs: number; pending_review: number }>(
    `SELECT (SELECT count(*) FROM outbox WHERE status = 'pending')::int AS pending_jobs,
            (SELECT count(*) FROM outbox WHERE status = 'failed')::int  AS failed_jobs,
            (SELECT count(*) FROM conversions WHERE status = 'pending')::int AS pending_review`,
  );

  const c = Number(clicks?.clicks ?? 0);
  return (
    <>
      <h1>Today (UTC)</h1>
      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat label="Clicks" value={count(c)} />
        <Stat label="Unique clicks" value={count(clicks?.uniques)} />
        <Stat label="Flagged clicks" value={count(clicks?.flagged)} />
        <Stat label="Conversions" value={count(conv.total)} />
        <Stat label="Conversion rate" value={pct(conv.total, c)} />
        <Stat label="Revenue" value={money(conv.revenue)} />
        <Stat label="Publisher payout" value={money(conv.payout)} />
        <Stat label="Margin" value={money(Number(conv.revenue) - Number(conv.payout))} />
      </div>
      <div className="card">
        <h2>Needs attention</h2>
        <ul>
          <li>
            <Link href="/admin/conversions?status=pending">{count(health.pending_review)} conversions waiting for review</Link>
          </li>
          <li>{count(health.pending_jobs)} publisher postbacks queued</li>
          <li className={health.failed_jobs > 0 ? 'error' : ''}>
            {count(health.failed_jobs)} publisher postbacks failed after all retries
          </li>
        </ul>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
