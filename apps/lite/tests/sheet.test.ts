// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { parseCsv, parseXlsx, readSheet } from '../lib/sheet.ts';
import { columnKey, exportCells, parseBool, visibilityOf } from '../lib/offerImport.ts';
import { toCsv } from '../lib/csv.ts';

/** Minimal zip writer (deflate, CRC left 0: the reader doesn't check it). */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text)), n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(Buffer.byteLength(text), 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(Buffer.byteLength(text), 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('CSV: quotes, escaped quotes, newlines in cells, CRLF, BOM', () => {
  const rows = parseCsv('﻿name,description,payout\r\n"A, Inc","He said ""hi""\nline 2",32.5\r\n\r\nB,,7\r\n');
  assert.deepEqual(rows, [['name', 'description', 'payout'], ['A, Inc', 'He said "hi"\nline 2', '32.5'], ['B', '', '7']]);
});

test('CSV: semicolon and tab delimiters are detected', () => {
  assert.deepEqual(parseCsv('id;name;payout\n1;Foo;3,5\n'), [['id', 'name', 'payout'], ['1', 'Foo', '3,5']]);
  assert.deepEqual(parseCsv('id\tname\n1\tFoo'), [['id', 'name'], ['1', 'Foo']]);
});

test('CSV: export → parse round trip keeps text, incl. formula-guarded cells', () => {
  const csv = toCsv([{ a: '=HYPERLINK("x")', b: '-5 off', c: 'plain, "quoted"' }], [
    { header: 'a', value: (r) => r.a }, { header: 'b', value: (r) => r.b }, { header: 'c', value: (r) => r.c },
  ]);
  assert.deepEqual(parseCsv(csv), [['a', 'b', 'c'], ['=HYPERLINK("x")', '-5 off', 'plain, "quoted"']]);
});

test('XLSX: shared strings, inline strings, numbers, booleans, gaps', () => {
  const buf = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Offers" sheetId="1" r:id="rId7"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/offers.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>name</t></si><si><t>payout</t></si><si><r><t>Brand &amp; </t></r><r><t xml:space="preserve">Co</t></r><rPh><t>x</t></rPh></si></sst>',
    'xl/worksheets/offers.xml': `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>flag</t></is></c></row>
      <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>32.499999999999993</v></c><c r="C3" s="1"/><c r="D3" t="b"><v>1</v></c></row>
    </sheetData></worksheet>`,
  });
  assert.deepEqual(parseXlsx(buf), [['name', 'payout', '', 'flag'], ['Brand & Co', '32.5', '', 'TRUE']]);
  assert.deepEqual(readSheet(buf)[1][0], 'Brand & Co');
});

test('XLSX: falls back to sheet1 and rejects non-zip / old .xls', () => {
  const buf = zip({ 'xl/worksheets/sheet1.xml': '<sheetData><row><c t="inlineStr"><is><t>id</t></is></c></row></sheetData>' });
  assert.deepEqual(parseXlsx(buf), [['id']]);
  assert.throws(() => readSheet(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), /\.xls/);
  assert.throws(() => parseXlsx(Buffer.from('PKnot really a zip')), /valid \.xlsx/);
});

test('offer import columns: aliases, booleans, visibility', () => {
  assert.equal(columnKey(' Offer ID '), 'id');
  assert.equal(columnKey('Payout %'), 'payout_percent');
  assert.equal(columnKey('Default Payout'), 'payout');
  assert.equal(columnKey('OS'), 'os');
  assert.equal(columnKey('colour'), null);
  assert.equal(parseBool('Yes'), true);
  assert.equal(parseBool(''), false);
  assert.equal(parseBool('maybe'), null);
  assert.equal(visibilityOf('Instant'), 'open');
  assert.equal(visibilityOf('Public, approval required'), 'public');
  assert.equal(visibilityOf('hidden'), null);
  const cells = exportCells({ id: 5, advertiser_id: 2, advertiser_email: null, name: 'X', default_payout: '3.00', require_terms: 1, os_targets: 'ios', status: 'paused', visibility: 'open' });
  assert.equal(cells.advertiser, '2');
  assert.equal(cells.payout, '3.00');
  assert.equal(cells.require_terms, 'yes');
  assert.equal(cells.os, 'ios');
  assert.equal(cells.kpi, '');
});
