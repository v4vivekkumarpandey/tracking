// Run: npm test   (Node 22.6+ runs TypeScript test files directly)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newClickId, parseClickId } from '../lib/clickid.ts';
import { expand } from '../lib/macros.ts';

const KEY = 'test-secret-0123456789';

test('click id round trip', () => {
  const now = new Date('2026-10-25T10:30:00.123Z');
  const id = newClickId(42, 7, 99_999, now, KEY);
  assert.equal(id, id.toLowerCase());
  assert.deepEqual(parseClickId(id, KEY), { offerId: 42, publisherId: 7, linkId: 99_999, time: now });
  assert.ok(parseClickId(id.toUpperCase(), KEY), 'uppercase parses');
});

test('large ids survive varint encoding', () => {
  const id = newClickId(2 ** 40, 300, 128, new Date(), KEY);
  const c = parseClickId(id, KEY)!;
  assert.equal(c.offerId, 2 ** 40);
  assert.equal(c.publisherId, 300);
  assert.equal(c.linkId, 128);
});

test('tampered or foreign ids are rejected', () => {
  const id = newClickId(1, 2, 3, new Date(), KEY);
  const flipped = id.slice(0, 20) + (id[20] === 'a' ? 'b' : 'a') + id.slice(21);
  assert.equal(parseClickId(flipped, KEY), null);
  assert.equal(parseClickId(id, 'another-secret-0123456'), null);
  for (const bad of ['', 'abc', '!!!!', id.slice(0, 10)]) assert.equal(parseClickId(bad, KEY), null);
});

// GO_CLICK_ID / GO_CLICK_SECRET: an ID produced by the Go tracker, to prove
// both versions share one format. Skipped when not provided.
test('accepts click ids from the Go tracker', { skip: !process.env.GO_CLICK_ID }, () => {
  const c = parseClickId(process.env.GO_CLICK_ID!, process.env.GO_CLICK_SECRET!);
  assert.ok(c, 'Go click id should verify');
  assert.equal(c.offerId, Number(process.env.GO_OFFER_ID ?? 1));
});

test('expand fills macros like the Go tracker', () => {
  const vals = { click_id: 'abc123', sub1: "a b&c!'()*~", pub_id: '7' };
  assert.equal(expand('https://x.com/?c={click_id}&p={pub_id}', vals), 'https://x.com/?c=abc123&p=7');
  assert.equal(expand('https://x.com/?s={sub1}', vals), 'https://x.com/?s=a+b%26c%21%27%28%29%2A~');
  assert.equal(expand('https://x.com/?s={sub2}', vals), 'https://x.com/?s=');
  assert.equal(expand('https://x.com/?j={"a":1}', vals), 'https://x.com/?j={"a":1}');
  assert.equal(expand('https://x.com/?broken={click_id', vals), 'https://x.com/?broken={click_id');
});
