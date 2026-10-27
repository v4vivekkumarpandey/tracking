// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceOf, osOf } from '../lib/device.ts';
import { HOLD, fraudScore } from '../lib/fraud.ts';
import { blockReason, pickOffer } from '../lib/routing.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const ANDROID_TAB = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';

test('device and OS detection', () => {
  assert.equal(deviceOf(IPHONE), 'mobile'); assert.equal(osOf(IPHONE), 'ios');
  assert.equal(deviceOf(IPAD), 'tablet'); assert.equal(osOf(IPAD), 'ios');
  assert.equal(deviceOf(ANDROID_PHONE), 'mobile'); assert.equal(osOf(ANDROID_PHONE), 'android');
  assert.equal(deviceOf(ANDROID_TAB), 'tablet');
  assert.equal(deviceOf(WIN), 'desktop'); assert.equal(osOf(WIN), 'windows');
  assert.equal(deviceOf(MAC), 'desktop'); assert.equal(osOf(MAC), 'mac');
  assert.equal(deviceOf(''), 'desktop');
});

const open = { countries: null, devices: null, daily_cap: null, monthly_cap: null, daily_budget: null };
const idle = { today: 0, month: 0, revenueToday: 0 };

test('targeting and caps', () => {
  assert.equal(blockReason(open, { country: '', device: 'desktop' }, idle), null);
  const us = { ...open, countries: 'us, ca' };
  assert.equal(blockReason(us, { country: 'US', device: 'mobile' }, idle), null);
  assert.equal(blockReason(us, { country: 'DE', device: 'mobile' }, idle), 'geo');
  assert.equal(blockReason(us, { country: '', device: 'mobile' }, idle), 'geo'); // unknown country on a geo-targeted offer
  assert.equal(blockReason({ ...open, devices: 'mobile,tablet' }, { country: 'US', device: 'desktop' }, idle), 'device');
  assert.equal(blockReason({ ...open, daily_cap: 10 }, { country: 'US', device: 'desktop' }, { ...idle, today: 9 }), null);
  assert.equal(blockReason({ ...open, daily_cap: 10 }, { country: 'US', device: 'desktop' }, { ...idle, today: 10 }), 'cap');
  assert.equal(blockReason({ ...open, monthly_cap: 100 }, { country: 'US', device: 'desktop' }, { ...idle, month: 100 }), 'cap');
  assert.equal(blockReason({ ...open, daily_budget: 500 }, { country: 'US', device: 'desktop' }, { ...idle, revenueToday: 500 }), 'cap');
});

test('OS targeting', () => {
  const mobileOs = { ...open, os: 'android,ios' };
  assert.equal(blockReason(mobileOs, { country: 'US', device: 'mobile', os: 'android' }, idle), null);
  assert.equal(blockReason(mobileOs, { country: 'US', device: 'mobile', os: 'ios' }, idle), null);
  assert.equal(blockReason(mobileOs, { country: 'US', device: 'desktop', os: 'windows' }, idle), 'os');
  assert.equal(blockReason(mobileOs, { country: 'US', device: 'desktop', os: 'linux' }, idle), 'os');
  assert.equal(blockReason(mobileOs, { country: 'US', device: 'desktop' }, idle), 'os'); // OS unknown on an OS-targeted offer
  assert.equal(blockReason({ ...open, os: null }, { country: 'US', device: 'desktop', os: 'linux' }, idle), null);
  // Device is checked before OS, so the reason names the first rule broken.
  assert.equal(blockReason({ ...mobileOs, devices: 'mobile' }, { country: 'US', device: 'desktop', os: 'mac' }, idle), 'device');
});

test('smart link selection', () => {
  const a = { id: 'a', epc: 0.9 }, b = { id: 'b', epc: 0.1 }, c = { id: 'c', epc: 0 };
  assert.equal(pickOffer([], () => 0.5), null);
  assert.equal(pickOffer([a], () => 0.5), a);
  // Deterministic sequence: first draw > explore → weighted; second draw picks the position.
  const seq = (...xs: number[]) => () => xs.shift()!;
  assert.equal(pickOffer([a, b, c], seq(0.5, 0.0)), a);
  assert.equal(pickOffer([a, b, c], seq(0.5, 0.95)), b);
  assert.equal(pickOffer([a, b, c], seq(0.05, 0.99)), c); // exploration: uniform
  // Over many draws the high-EPC offer gets most traffic, but not all.
  let n = 0, s = 42;
  const rng = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 10000; i++) if (pickOffer([a, b, c], rng) === a) n++;
  assert.ok(n > 7500 && n < 9500, `a picked ${n}/10000`);
});

const clean = { ctit: 600, clickExpected: true, clickBot: false, clickDuplicate: false, sameIpToday: 0,
  pubCrToday: 0.02, pubCr7d: 0.02, pubClicksToday: 100, pubConvToday: 2 };

test('fraud scoring', () => {
  assert.deepEqual(fraudScore(clean), { score: 0, reasons: [] });
  const fast = fraudScore({ ...clean, ctit: 2 });
  assert.equal(fast.score, 60); assert.match(fast.reasons[0], /2s after click/);
  assert.ok(fraudScore({ ...clean, ctit: 2, clickBot: true }).score >= HOLD, 'fast + bot is held');
  assert.equal(fraudScore({ ...clean, ctit: null }).score, 30);
  assert.equal(fraudScore({ ...clean, ctit: null, clickExpected: false }).score, 0); // click aged out
  assert.equal(fraudScore({ ...clean, sameIpToday: 3 }).score, 30);
  const spike = fraudScore({ ...clean, pubCrToday: 0.3, pubCr7d: 0.02, pubClicksToday: 50, pubConvToday: 15 });
  assert.equal(spike.score, 30); assert.match(spike.reasons[0], /conversion rate 30.0% vs 2.0%/);
  assert.equal(fraudScore({ ...clean, ctit: 1, clickBot: true, clickDuplicate: true, sameIpToday: 5 }).score, 100);
});
