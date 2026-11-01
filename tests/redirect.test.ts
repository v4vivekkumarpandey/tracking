// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deepLinkTarget, parseDomains, redirectTarget } from '../lib/deeplink.ts';

const dest = 'https://www.brand.com/lp?click_id={click_id}';
const IMPACT = 'https://go.sjv.io/c/4410320/3930529/54011?force_deeplink=1&u=https://www.xteink.com/';

test('transparent: the URL comes back byte for byte', () => {
  assert.equal(redirectTarget(IMPACT, dest, ['go.sjv.io'], 'click_id', 'CK', true), IMPACT);
  assert.equal(redirectTarget('https://brand.com/p?a=1#top', dest, [], 'click_id', 'CK', true), 'https://brand.com/p?a=1#top');
});

test('not transparent: the click ID is added', () => {
  assert.equal(redirectTarget('https://brand.com/p?a=1', dest, [], 'cid', 'CK', false), 'https://brand.com/p?a=1&cid=CK');
  assert.equal(redirectTarget('https://shop.go.sjv.io/x', dest, ['go.sjv.io'], 'cid', 'CK', false), 'https://shop.go.sjv.io/x?cid=CK');
});

test('only the offer site and the extra domains are allowed', () => {
  for (const transparent of [true, false]) {
    for (const bad of ['https://evil.com/', 'https://go.sjv.io.evil.com/', 'https://evilgo.sjv.io/', 'https://brand.com.evil.com/',
      'javascript:alert(1)', 'ftp://go.sjv.io/', 'https://user:pw@go.sjv.io/', 'not a url', '//go.sjv.io/x', 'https://evil.com\\@go.sjv.io/']) {
      assert.equal(redirectTarget(bad, dest, ['go.sjv.io'], 'cid', 'CK', transparent), null, `should reject ${bad}`);
    }
  }
  assert.equal(redirectTarget(IMPACT, dest, [], 'cid', 'CK', true), null, 'not listed');
});

test('extra domains do not widen deep links', () => {
  assert.equal(deepLinkTarget('https://go.sjv.io/x', dest, 'cid', 'CK'), null);
});

test('parseDomains cleans the list and rejects anything but domains', () => {
  assert.equal(parseDomains(' Go.SJV.io, xteink.com;go.sjv.io\nshop.example.co.uk '), 'go.sjv.io,xteink.com,shop.example.co.uk');
  assert.equal(parseDomains('  '), null);
  for (const bad of ['https://go.sjv.io', '*.brand.com', 'localhost', 'go.sjv.io/path', '-bad.com']) {
    assert.throws(() => parseDomains(bad), /isn't a domain/, bad);
  }
  assert.throws(() => parseDomains(Array.from({ length: 60 }, (_, i) => `domain${i}.example.com`).join(',')), /Too many/);
});
