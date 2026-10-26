import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session';

// Fast redirect for visitors with no session cookie. Signature checks happen
// server-side in requireAdmin(), so this is a convenience, not the guard.
export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
