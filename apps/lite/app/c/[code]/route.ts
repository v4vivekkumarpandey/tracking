import { NextResponse, type NextRequest } from 'next/server';
import { serveClick, visitorOf } from '@/lib/click';
import { activeDomainOwner } from '@/lib/domains';
import { getLink } from '@/lib/links';
import { trackingContext } from '@/lib/request';

export const dynamic = 'force-dynamic';

function fallback() {
  const url = process.env.FALLBACK_URL;
  return url ? NextResponse.redirect(url, 302) : new NextResponse('Not found', { status: 404 });
}

// GET /c/{code}?source_id=..&sub1=..&sub10=..[&lp=page id][&url=deep link]  ->  302 to the offer (or its fallback).
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  let link;
  try {
    link = await getLink((await params).code);
  } catch (err) {
    console.error('link lookup', err);
    return fallback();
  }
  if (!link || !link.active) return fallback();

  // On a custom domain (forwarded by our Cloudflare Worker), only links the
  // domain's owner is entitled to are served: the publisher's own links, or
  // links to the advertiser's own offers.
  const ctx = trackingContext(req);
  if (ctx.viaProxy) {
    const owner = await activeDomainOwner(ctx.host).catch(() => null);
    const allowed =
      (owner?.type === 'publisher' && owner.id === link.publisherId) ||
      (owner?.type === 'advertiser' && owner.id === link.advertiserId);
    if (!allowed) return new NextResponse('Not found', { status: 404 });
  }

  return serveClick(req, link, await visitorOf(req, ctx));
}
