import type { NextRequest } from 'next/server';

export const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python|go-http|java\/|headless|phantom|scrapy|httpclient/i;

/**
 * Visitor IP. On shared hosting the app sits behind the host's proxy, which
 * sets X-Real-IP / appends to X-Forwarded-For. The last X-Forwarded-For entry
 * is the one the proxy added; earlier entries can be faked by the visitor.
 * Check /api/whoami after deploying to confirm your IP shows correctly.
 */
export function clientIp(req: NextRequest): string {
  return ipFromHeaders(req.headers);
}

export function ipFromHeaders(h: Headers): string {
  const real = h.get('x-real-ip');
  if (real) return real.trim().slice(0, 45);
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 45);
  }
  return '';
}

export function trunc(s: string | null | undefined, n: number): string {
  return (s ?? '').slice(0, n);
}
