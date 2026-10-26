import { NextResponse, type NextRequest } from 'next/server';
import { offerEpc } from '@/lib/caps';
import { canServe, serveClick, visitorOf } from '@/lib/click';
import { q } from '@/lib/db';
import { activeDomainOwner } from '@/lib/domains';
import { activeLinksOf } from '@/lib/links';
import { trackingContext } from '@/lib/request';
import { pickOffer } from '@/lib/routing';

export const dynamic = 'force-dynamic';

function fallback() {
  const url = process.env.FALLBACK_URL;
  return url ? NextResponse.redirect(url, 302) : new NextResponse('Not found', { status: 404 });
}

// GET /s/{code}?sub1=..  Smart link: picks one of the publisher's approved
// offers that accepts this visitor (country, device, caps), weighted by
// 7-day earnings per click, and serves it like a normal tracking link.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const [sl] = await q<{ id: number; publisher_id: number }>(
    `SELECT s.id, s.publisher_id FROM smart_links s JOIN publishers p ON p.id = s.publisher_id
     WHERE s.code = ? AND s.status = 'active' AND p.status = 'active'`,
    [(await params).code],
  ).catch(() => []);
  if (!sl) return fallback();

  const ctx = trackingContext(req);
  if (ctx.viaProxy) {
    const owner = await activeDomainOwner(ctx.host).catch(() => null);
    if (!(owner?.type === 'publisher' && owner.id === Number(sl.publisher_id))) return new NextResponse('Not found', { status: 404 });
  }

  const v = await visitorOf(req, ctx);
  const [links, epc] = await Promise.all([activeLinksOf(Number(sl.publisher_id)), offerEpc()]);
  const eligible = [];
  for (const l of links) if (!(await canServe(l, v))) eligible.push({ link: l, epc: epc.get(l.offerId) ?? 0 });
  const pick = pickOffer(eligible);
  if (!pick) return fallback();
  return serveClick(req, pick.link, v, { smartLinkId: Number(sl.id), checked: true });
}
