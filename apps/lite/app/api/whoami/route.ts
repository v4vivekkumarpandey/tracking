import { NextResponse, type NextRequest } from 'next/server';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

// After deploying, open this in a browser: "ip" should be your own public IP
// (compare with any "what is my IP" site). Only echoes the caller's own data.
export function GET(req: NextRequest) {
  return NextResponse.json({
    ip: clientIp(req),
    'x-real-ip': req.headers.get('x-real-ip'),
    'x-forwarded-for': req.headers.get('x-forwarded-for'),
    'cf-ipcountry': req.headers.get('cf-ipcountry'),
  });
}
