import { type NextRequest } from 'next/server';
import { recordConversion } from '@/lib/conversions';
import { activeDomainOwner } from '@/lib/domains';
import { trackingContext } from '@/lib/request';

export const dynamic = 'force-dynamic';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Browser pixel: GET /px?click_id=..&goal=..&amount=..&txn_id=..
// No secret (it would be visible in the page anyway); pixel conversions are
// marked source=pixel so they can be reviewed before approval. Advertisers
// can serve it from their own domain (first-party), via our Cloudflare Worker.
//
// Without click_id, /px?offer_id=ID&… falls back to the click cookie set on
// the redirect (see setClickCookie in lib/click.ts).
export async function GET(req: NextRequest) {
  const ctx = trackingContext(req);
  const allowed = !ctx.viaProxy || (await activeDomainOwner(ctx.host).catch(() => null));
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const offerId = params.get('offer_id') ?? '';
  if (!params.get('click_id') && /^\d{1,12}$/.test(offerId)) {
    const saved = req.cookies.get(`_trk_o${offerId}`)?.value;
    if (saved) params.set('click_id', saved);
  }
  if (allowed) await recordConversion(params, 'pixel', ctx.ip);
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });
}
