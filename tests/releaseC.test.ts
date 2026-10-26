// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromCents, invoiceNumber, invoiceTotals, pctOf, toCents } from '../lib/money.ts';

test('cents conversion avoids float drift', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), 30);
  assert.equal(fromCents(toCents('19.99') * 3), '59.97');
  assert.equal(toCents(1234.565), 123457);
});

test('referral commission rounding', () => {
  assert.equal(pctOf(toCents('140.00'), 5), 700);   // $7.00
  assert.equal(pctOf(toCents('0.10'), 5), 1);       // 0.5 cent rounds up
  assert.equal(pctOf(toCents('33.33'), 7.5), 250);  // 249.975 → 250
  assert.equal(pctOf(0, 5), 0);
});

test('invoice totals and numbering', () => {
  assert.deepEqual(invoiceTotals([toCents('200.00'), toCents('45.50')], 0), { subtotal: 24550, tax: 0, total: 24550 });
  assert.deepEqual(invoiceTotals([toCents('100.00'), toCents('0.01')], 18), { subtotal: 10001, tax: 1800, total: 11801 });
  assert.equal(invoiceNumber(2026, 7), 'INV-2026-0007');
  assert.equal(invoiceNumber(2026, 12345), 'INV-2026-12345');
});
