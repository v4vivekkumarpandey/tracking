import { createHash, timingSafeEqual } from 'node:crypto';
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

export type TrackingContext = { host: string; ip: string; country: string; viaProxy: boolean };

/**
 * Where a tracking request really came from. Requests on custom domains are
 * forwarded by our Cloudflare Worker, which adds X-Tracking-Host,
 * X-Visitor-IP and X-Visitor-Country plus X-Tracking-Key. Those headers are
 * believed only when the key matches PROXY_SECRET; anyone can send them, so
 * without the key they are ignored.
 */
export function trackingContextFrom(h: Headers, secret: string): TrackingContext {
  const key = h.get('x-tracking-key') ?? '';
  if (secret.length >= 16 && key && safeEqual(key, secret)) {
    const country = (h.get('x-visitor-country') ?? '').toUpperCase();
    return {
      host: (h.get('x-tracking-host') ?? '').toLowerCase().slice(0, 253),
      ip: (h.get('x-visitor-ip') ?? '').trim().slice(0, 45),
      country: /^[A-Z]{2}$/.test(country) ? country : '',
      viaProxy: true,
    };
  }
  return {
    host: (h.get('host') ?? '').toLowerCase().replace(/:\d+$/, ''),
    ip: ipFromHeaders(h),
    country: '',
    viaProxy: false,
  };
}

export function trackingContext(req: NextRequest): TrackingContext {
  return trackingContextFrom(req.headers, process.env.PROXY_SECRET ?? '');
}

function safeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

export function trunc(s: string | null | undefined, n: number): string {
  return (s ?? '').slice(0, n);
}
