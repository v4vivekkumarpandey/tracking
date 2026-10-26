// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, toCsv } from '../lib/csv.ts';
import { deepLinkTarget, landingHost } from '../lib/deeplink.ts';
import { imageInfo } from '../lib/imageInfo.ts';

test('csv escaping and formula-injection guard', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell(-5), '-5'); // real numbers are not touched
  assert.equal(csvCell(null), '');
  const out = toCsv([{ a: 1, b: 'x' }], [{ header: 'A', value: (r) => r.a }, { header: 'B', value: (r) => r.b }]);
  assert.equal(out, '﻿A,B\r\n1,x\r\n');
});

test('deep links only to the landing domain', () => {
  const dest = 'https://www.brand.com/lp?cid={click_id}';
  assert.equal(landingHost(dest), 'www.brand.com');
  assert.equal(deepLinkTarget('https://www.brand.com/p/42', dest, 'cid', 'CK'), 'https://www.brand.com/p/42?cid=CK');
  assert.equal(deepLinkTarget('https://brand.com/p?x=1', dest, 'cid', 'CK'), 'https://brand.com/p?x=1&cid=CK');
  assert.equal(deepLinkTarget('https://shop.brand.com/a', dest, 'click_id', 'CK'), 'https://shop.brand.com/a?click_id=CK');
  for (const bad of ['https://evil.com/', 'https://brand.com.evil.com/', 'https://evilbrand.com/', 'javascript:alert(1)',
    'ftp://www.brand.com/', 'https://user:pw@www.brand.com/', 'not a url', '//www.brand.com/x']) {
    assert.equal(deepLinkTarget(bad, dest, 'cid', 'CK'), null, `should reject ${bad}`);
  }
  // A two-part public suffix must not open up the whole suffix.
  const uk = 'https://brand.co.uk/';
  assert.equal(deepLinkTarget('https://other.co.uk/', uk, 'cid', 'CK'), null);
  assert.ok(deepLinkTarget('https://shop.brand.co.uk/x', uk, 'cid', 'CK'));
});

test('imageInfo reads real image headers', () => {
  const png = Buffer.alloc(40);
  png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(0x0d0a1a0a, 4); png.writeUInt32BE(300, 16); png.writeUInt32BE(250, 20);
  assert.deepEqual(imageInfo(png), { mime: 'image/png', ext: 'png', width: 300, height: 250 });

  const gif = Buffer.alloc(40); gif.write('GIF89a', 0, 'ascii'); gif.writeUInt16LE(728, 6); gif.writeUInt16LE(90, 8);
  assert.deepEqual(imageInfo(gif), { mime: 'image/gif', ext: 'gif', width: 728, height: 90 });

  // JPEG: SOI, an APP0 segment, then SOF0 with height 600 / width 160.
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x00, 0xa0, ...Array(30).fill(0)]);
  assert.deepEqual(imageInfo(jpg), { mime: 'image/jpeg', ext: 'jpg', width: 160, height: 600 });

  const webp = Buffer.alloc(40); webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(319, 24, 3); webp.writeUIntLE(49, 27, 3);
  assert.deepEqual(imageInfo(webp), { mime: 'image/webp', ext: 'webp', width: 320, height: 50 });

  assert.equal(imageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>                     ')), null);
  assert.equal(imageInfo(Buffer.from('<html><script>alert(1)</script></html>               ')), null);
});
