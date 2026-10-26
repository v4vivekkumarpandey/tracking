// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeHostname } from '../lib/hostname.ts';
import { trackingContextFrom } from '../lib/request.ts';

const PRIMARY = 'trk.ossaward.org';

test('normalizeHostname accepts and cleans real domains', () => {
  assert.equal(normalizeHostname('track.example.com', PRIMARY), 'track.example.com');
  assert.equal(normalizeHostname('  Track.Example.COM ', PRIMARY), 'track.example.com');
  assert.equal(normalizeHostname('https://track.example.com/', PRIMARY), 'track.example.com');
  assert.equal(normalizeHostname('go.brand.co.uk', PRIMARY), 'go.brand.co.uk');
  assert.equal(normalizeHostname('track.bücher.de', PRIMARY), 'track.xn--bcher-kva.de'); // IDN → punycode
});

test('normalizeHostname rejects bad input', () => {
  for (const bad of ['', 'localhost', '127.0.0.1', '[::1]', 'track.example.com:8080', 'track.example.com/path',
    'track.example.com?x=1', 'exa mple.com', '-bad.example.com', 'example.123', 'user@track.example.com']) {
    assert.throws(() => normalizeHostname(bad, PRIMARY), undefined, `should reject ${JSON.stringify(bad)}`);
  }
});

test('normalizeHostname rejects our own domain', () => {
  for (const ours of ['ossaward.org', 'trk.ossaward.org', 'domains.ossaward.org', 'x.y.ossaward.org']) {
    assert.throws(() => normalizeHostname(ours, PRIMARY), /not ours/);
  }
});

const SECRET = 'proxy-secret-0123456789';
const headers = (h: Record<string, string>) => new Headers(h);

test('proxy headers are trusted only with the right key', () => {
  const forwarded = {
    host: 'trk.ossaward.org', 'x-real-ip': '104.16.0.1',
    'x-tracking-host': 'Track.Pub.com', 'x-visitor-ip': '203.0.113.9', 'x-visitor-country': 'de',
  };
  const ok = trackingContextFrom(headers({ ...forwarded, 'x-tracking-key': SECRET }), SECRET);
  assert.deepEqual(ok, { host: 'track.pub.com', ip: '203.0.113.9', country: 'DE', viaProxy: true });

  for (const key of ['', 'wrong', SECRET + 'x']) {
    const c = trackingContextFrom(headers({ ...forwarded, 'x-tracking-key': key }), SECRET);
    assert.equal(c.viaProxy, false, `key ${JSON.stringify(key)} must not be trusted`);
    assert.equal(c.host, 'trk.ossaward.org');
    assert.equal(c.ip, '104.16.0.1');
    assert.equal(c.country, '');
  }
  // A short/unset PROXY_SECRET disables the proxy path entirely.
  assert.equal(trackingContextFrom(headers({ ...forwarded, 'x-tracking-key': '' }), '').viaProxy, false);
  assert.equal(trackingContextFrom(headers({ ...forwarded, 'x-tracking-key': 'short' }), 'short').viaProxy, false);
});
