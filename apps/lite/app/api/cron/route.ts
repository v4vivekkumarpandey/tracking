import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { exec } from '@/lib/db';
import { refreshPending } from '@/lib/domains';
import { processOutbox } from '@/lib/outbox';

export const dynamic = 'force-dynamic';

const digest = (s: string) => createHash('sha256').update(s).digest();

// Called every minute by an hPanel cron job:
//   wget -q -O /dev/null "https://trk.example.com/api/cron?key=CRON_SECRET"
// Retries failed publisher postbacks and deletes old raw data.
export async function GET(req: NextRequest) {
  const want = process.env.CRON_SECRET ?? '';
  const got = req.nextUrl.searchParams.get('key') ?? '';
  if (want.length < 8 || !timingSafeEqual(digest(got), digest(want))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const outbox = await processOutbox();
  // Pending conversions the advertiser didn't review in time are approved,
  // except ones fraud detection marked high-risk (score >= 70).
  const auto = await exec(
    `UPDATE conversions c JOIN offers o ON o.id = c.offer_id
     SET c.status = 'approved', c.approved_by = 'auto', c.updated_at = NOW(3)
     WHERE c.status = 'pending' AND o.auto_approve_days IS NOT NULL AND c.fraud_score < 70
       AND c.created_at < NOW(3) - INTERVAL o.auto_approve_days DAY`,
  );
  // Custom domains waiting for their CNAME / SSL become active without anyone clicking "Check now".
  const domainsChecked = await refreshPending(20).catch((e) => {
    console.error('refresh domains', e);
    return 0;
  });

  // Cleanup in small batches so one run never locks tables for long.
  const keepDays = Math.max(7, Number(process.env.CLICK_RETENTION_DAYS ?? 90));
  const clicks = await exec(`DELETE FROM clicks WHERE ts < NOW(3) - INTERVAL ? DAY LIMIT 5000`, [keepDays]);
  const logs = await exec(`DELETE FROM postback_log WHERE created_at < NOW(3) - INTERVAL 180 DAY LIMIT 5000`);

  return NextResponse.json({ ok: true, outbox, autoApproved: auto.affectedRows, domainsChecked, deleted: { clicks: clicks.affectedRows, postback_log: logs.affectedRows } });
}
