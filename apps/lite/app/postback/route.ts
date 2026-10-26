import { NextResponse, type NextRequest } from 'next/server';
import { recordConversion } from '@/lib/conversions';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

// Server-to-server postback from advertisers:
//   GET|POST /postback?click_id=..&secret=..&goal=..&amount=..&txn_id=..
export async function GET(req: NextRequest) {
  const [code, body] = await recordConversion(req.nextUrl.searchParams, 's2s', clientIp(req));
  return NextResponse.json(body, { status: code });
}

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData();
    form.forEach((v, k) => typeof v === 'string' && params.set(k, v));
  }
  const [code, body] = await recordConversion(params, 's2s', clientIp(req));
  return NextResponse.json(body, { status: code });
}
