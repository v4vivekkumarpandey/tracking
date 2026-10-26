// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fraudScore } from '../lib/fraud.ts';
import { isDatacenter, parseIp, parseRule, ruleMatches } from '../lib/ipRules.ts';
import { pickLanding } from '../lib/routing.ts';

const rule = (s: string) => {
  const p = parseRule(s);
  if ('error' in p) throw new Error(p.error);
  return p.rule;
};
const hit = (r: string, ip: string, asn: number | null = null) => ruleMatches(rule(r), parseIp(ip), asn);

test('IP parsing', () => {
  assert.equal(parseIp('203.0.113.7')?.v, 4);
  assert.equal(parseIp('256.1.1.1'), null);
  assert.equal(parseIp('2001:db8::1')?.v, 6);
  assert.equal(parseIp('::1')?.n, 1n);
  assert.equal(parseIp('2001:db8::1::2'), null);
  assert.equal(parseIp('not-an-ip'), null);
  // IPv4-mapped IPv6 is treated as IPv4
  assert.deepEqual(parseIp('::ffff:203.0.113.7'), parseIp('203.0.113.7'));
});

test('blocklist rules', () => {
  assert.ok(hit('203.0.113.7', '203.0.113.7'));
  assert.ok(!hit('203.0.113.7', '203.0.113.8'));
  assert.ok(hit('203.0.113.0/24', '203.0.113.200'));
  assert.ok(!hit('203.0.113.0/24', '203.0.114.1'));
  assert.ok(hit('203.0.113.99/24', '203.0.113.1'), 'host bits in the rule are ignored');
  assert.ok(hit('2001:db8::/32', '2001:db8:abcd::1'));
  assert.ok(!hit('2001:db8::/32', '2001:db9::1'));
  assert.ok(!hit('203.0.113.0/24', '2001:db8::1'), 'IPv4 rule never matches IPv6');
  assert.ok(hit('AS14061', '1.2.3.4', 14061));
  assert.ok(!hit('AS14061', '1.2.3.4', 16509));
  assert.equal((parseRule('as14061') as { text: string }).text, 'AS14061');
  assert.ok('error' in parseRule('0.0.0.0/0'), 'too wide');
  assert.ok('error' in parseRule('10.0.0.0/4'), 'too wide');
  assert.ok('error' in parseRule('example.com'));
  assert.ok('error' in parseRule('1.2.3.4/33'));
});

test('data-center networks', () => {
  assert.ok(isDatacenter(16509, 'Amazon.com, Inc.'));
  assert.ok(isDatacenter(14061, 'DigitalOcean, LLC'));
  assert.ok(isDatacenter(99999, 'Some VPS Hosting Ltd'));
  assert.ok(isDatacenter(99998, 'NordVPN S.A.'));
  assert.ok(!isDatacenter(55836, 'Reliance Jio Infocomm Limited'));
  assert.ok(!isDatacenter(21928, 'T-Mobile USA, Inc.'));
  assert.ok(!isDatacenter(7922, 'Comcast Cable Communications, LLC'));
  // iCloud Private Relay / WARP egress: real people
  assert.ok(!isDatacenter(13335, 'Cloudflare, Inc.'));
  assert.ok(!isDatacenter(36183, 'Akamai Technologies, Inc.'));
  assert.ok(!isDatacenter(null, ''));
});

test('landing page choice', () => {
  const pages = [{ id: 5, name: 'Quiz', url: 'https://a/q', weight: 30 }, { id: 6, name: 'Video', url: 'https://a/v', weight: 20 }];
  assert.equal(pickLanding(pages, 6, () => 0.99)?.id, 6, 'publisher choice wins');
  assert.equal(pickLanding(pages, 999, () => 0.1)?.id, 5, 'unknown choice falls back to the split');
  assert.equal(pickLanding(pages, null, () => 0.1)?.id, 5);   // 10 → first 30%
  assert.equal(pickLanding(pages, null, () => 0.4)?.id, 6);   // 40 → next 20%
  assert.equal(pickLanding(pages, null, () => 0.6), null);    // 60 → default
  assert.equal(pickLanding([], null, () => 0), null);
  assert.equal(pickLanding([{ ...pages[0], weight: 0 }], null, () => 0), null, '0% only when chosen');
  // the split is honoured on average
  let quiz = 0, n = 10_000, seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) if (pickLanding(pages, null, rand)?.id === 5) quiz++;
  assert.ok(Math.abs(quiz / n - 0.3) < 0.02, `quiz share ${quiz / n}`);
});

test('data-center click raises the fraud score', () => {
  const clean = { ctit: 600, clickExpected: true, clickBot: false, clickDuplicate: false, sameIpToday: 0, pubCrToday: 0, pubCr7d: 0, pubClicksToday: 0, pubConvToday: 1 };
  assert.equal(fraudScore(clean).score, 0);
  const dc = fraudScore({ ...clean, clickDatacenter: 'DigitalOcean, LLC' });
  assert.equal(dc.score, 40);
  assert.match(dc.reasons[0], /data-center\/VPN IP \(DigitalOcean/);
  assert.ok(fraudScore({ ...clean, ctit: 5, clickDatacenter: 'OVH SAS' }).score >= 70, 'instant + data center is held');
});
