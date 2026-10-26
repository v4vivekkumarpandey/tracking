import { type NextRequest } from 'next/server';
import { recordConversion } from '@/lib/conversions';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Browser pixel: GET /px?click_id=..&goal=..&amount=..&txn_id=..
// No secret (it would be visible in the page anyway); pixel conversions are
// marked source=pixel so they can be reviewed before approval.
export async function GET(req: NextRequest) {
  await recordConversion(req.nextUrl.searchParams, 'pixel', clientIp(req));
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } });
}
