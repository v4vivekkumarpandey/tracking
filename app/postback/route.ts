import { NextResponse, type NextRequest } from 'next/server';
import { recordConversion } from '@/lib/conversions';
import { activeDomainOwner } from '@/lib/domains';
import { trackingContext } from '@/lib/request';

export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ status: 'rejected', error: 'unknown domain' }, { status: 404 });

/** On a custom domain, only answer if the domain is active. */
async function context(req: NextRequest) {
  const ctx = trackingContext(req);
  if (ctx.viaProxy && !(await activeDomainOwner(ctx.host).catch(() => null))) return null;
  return ctx;
}

// Server-to-server postback from advertisers:
//   GET|POST /postback?click_id=..&secret=..&goal=..&amount=..&txn_id=..
export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return notFound();
  const [code, body] = await recordConversion(req.nextUrl.searchParams, 's2s', ctx.ip);
  return NextResponse.json(body, { status: code });
}

export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return notFound();
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData();
    form.forEach((v, k) => typeof v === 'string' && params.set(k, v));
  }
  const [code, body] = await recordConversion(params, 's2s', ctx.ip);
  return NextResponse.json(body, { status: code });
}
