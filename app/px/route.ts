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
export async function GET(req: NextRequest) {
  const ctx = trackingContext(req);
  const allowed = !ctx.viaProxy || (await activeDomainOwner(ctx.host).catch(() => null));
  if (allowed) await recordConversion(req.nextUrl.searchParams, 'pixel', ctx.ip);
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });
}
