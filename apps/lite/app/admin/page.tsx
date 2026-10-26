import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, money, pct } from '@/lib/format';

export default async function Overview() {
  await requireAdmin();
  const [[clicks], [conv], [health]] = await Promise.all([
    q<{ clicks: string; uniques: string; flagged: string }>(
      `SELECT COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(uniques), 0) AS uniques, COALESCE(SUM(flagged), 0) AS flagged
       FROM stats_hourly WHERE hour >= UTC_DATE()`,
    ),
    q<{ total: string; revenue: string; payout: string }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status <> 'rejected' THEN revenue END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status <> 'rejected' THEN payout END), 0) AS payout
       FROM conversions WHERE created_at >= UTC_DATE()`,
    ),
    q<{ pending_jobs: string; failed_jobs: string; pending_review: string }>(
      `SELECT (SELECT COUNT(*) FROM outbox WHERE status = 'pending') AS pending_jobs,
              (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed_jobs,
              (SELECT COUNT(*) FROM conversions WHERE status = 'pending') AS pending_review`,
    ),
  ]);

  const c = Number(clicks.clicks);
  return (
    <>
      <h1>Today (UTC)</h1>
      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat label="Clicks" value={count(c)} />
        <Stat label="Unique clicks" value={count(clicks.uniques)} />
        <Stat label="Flagged clicks" value={count(clicks.flagged)} />
        <Stat label="Conversions" value={count(conv.total)} />
        <Stat label="Conversion rate" value={pct(Number(conv.total), c)} />
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
          <li className={Number(health.failed_jobs) > 0 ? 'error' : ''}>
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
