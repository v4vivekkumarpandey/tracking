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
  // Custom domains waiting for their CNAME / SSL become active without anyone clicking "Check now".
  const domainsChecked = await refreshPending(20).catch((e) => {
    console.error('refresh domains', e);
    return 0;
  });

  // Cleanup in small batches so one run never locks tables for long.
  const keepDays = Math.max(7, Number(process.env.CLICK_RETENTION_DAYS ?? 90));
  const clicks = await exec(`DELETE FROM clicks WHERE ts < NOW(3) - INTERVAL ? DAY LIMIT 5000`, [keepDays]);
  const logs = await exec(`DELETE FROM postback_log WHERE created_at < NOW(3) - INTERVAL 180 DAY LIMIT 5000`);

  return NextResponse.json({ ok: true, outbox, domainsChecked, deleted: { clicks: clicks.affectedRows, postback_log: logs.affectedRows } });
}
