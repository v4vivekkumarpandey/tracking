import { createHmac, timingSafeEqual } from 'node:crypto';

// The Link Test tool requests our own tracking links over the network. It
// sends this header so the click path can tell a test from a real visitor;
// only this server can compute the value.

export const LINK_TEST_HEADER = 'x-trk-linktest';

export function linkTestToken(): string {
  return createHmac('sha256', process.env.CLICK_SECRET ?? '').update('link-test').digest('hex');
}

export function isLinkTest(value: string | null): boolean {
  if (!value || (process.env.CLICK_SECRET ?? '').length < 16) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(linkTestToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
