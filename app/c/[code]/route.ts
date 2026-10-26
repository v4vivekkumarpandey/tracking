import { NextResponse, type NextRequest } from 'next/server';
import { newClickId } from '@/lib/clickid';
import { exec, q } from '@/lib/db';
import { getLink } from '@/lib/links';
import { expand } from '@/lib/macros';
import { BOT_UA, clientIp, trunc } from '@/lib/request';

export const dynamic = 'force-dynamic';

// Same IP clicking the same offer again within this window is flagged.
const DUP_WINDOW_MS = 10_000;

function fallback() {
  const url = process.env.FALLBACK_URL;
  return url ? NextResponse.redirect(url, 302) : new NextResponse('Not found', { status: 404 });
}

// GET /c/{code}?sub1=..&sub5=  ->  302 to the offer with macros filled in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  let link;
  try {
    link = await getLink((await params).code);
  } catch (err) {
    console.error('link lookup', err);
    return fallback();
  }
  if (!link || !link.active) return fallback();

  const now = new Date();
  const clickId = newClickId(link.offerId, link.publisherId, link.id, now);
  const sp = req.nextUrl.searchParams;
  const subs = [1, 2, 3, 4, 5].map((i) => trunc(sp.get(`sub${i}`), 255));
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') ?? '';

  const vals: Record<string, string> = {
    click_id: clickId,
    offer_id: String(link.offerId),
    pub_id: String(link.publisherId),
    publisher_id: String(link.publisherId),
  };
  subs.forEach((s, i) => (vals[`sub${i + 1}`] = s));

  // Recording must never block the visitor: on a database error we still
  // redirect and log the problem.
  try {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [prev] = await q<{ last: Date | null }>(
      `SELECT MAX(ts) AS last FROM clicks WHERE offer_id = ? AND ip = ? AND ts >= ?`,
      [link.offerId, ip, dayStart],
    );
    const unique = !prev?.last;
    const isDup = !!prev?.last && now.getTime() - new Date(prev.last).getTime() < DUP_WINDOW_MS;
    const isBot = !ua || BOT_UA.test(ua);

    await exec(
      `INSERT INTO clicks (click_id, ts, offer_id, publisher_id, link_id, ip, ua, referer, country,
                           sub1, sub2, sub3, sub4, sub5, is_bot, is_duplicate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clickId, now, link.offerId, link.publisherId, link.id, ip, trunc(ua, 512),
       trunc(req.headers.get('referer'), 512), trunc(req.headers.get('cf-ipcountry'), 2),
       ...subs, isBot, isDup],
    );
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const flagged = isBot || isDup ? 1 : 0;
    const uniq = unique ? 1 : 0;
    await exec(
      `INSERT INTO stats_hourly (hour, offer_id, publisher_id, clicks, uniques, flagged) VALUES (?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE clicks = clicks + 1, uniques = uniques + ?, flagged = flagged + ?`,
      [hour, link.offerId, link.publisherId, uniq, flagged, uniq, flagged],
    );
  } catch (err) {
    console.error('record click', err);
  }

  const res = NextResponse.redirect(expand(link.destination, vals), 302);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  return res;
}
