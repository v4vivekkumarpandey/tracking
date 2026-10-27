// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, parseMethod } from '../lib/paymentTypes.ts';
import { profileFrom } from '../lib/profile.ts';

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const ok = (type: string, o: Record<string, string>) => {
  const r = parseMethod(type, form(o));
  if ('error' in r) throw new Error(r.error);
  return r.details;
};
const err = (type: string, o: Record<string, string>) => {
  const r = parseMethod(type, form(o));
  return 'error' in r ? r.error : '';
};

test('payment methods are validated per type', () => {
  assert.deepEqual(ok('paypal', { paypal_email: 'me@example.com' }), { email: 'me@example.com' });
  assert.match(err('paypal', { paypal_email: 'not-an-email' }), /doesn't look right/);
  assert.match(err('paypal', {}), /required/);
  const bank = ok('bank', { bank_holder: 'A Kumar', bank_bank: 'HDFC', bank_account: '50100 1234 5678', bank_code: 'hdfc0001234', bank_country: 'in' });
  assert.equal(bank.code, 'HDFC0001234', 'codes are upper-cased');
  assert.equal(describe('bank', bank), 'A Kumar · HDFC · 50100 1234 5678 · HDFC0001234 · IN');
  assert.match(err('bank', { bank_holder: 'A', bank_bank: 'HDFC', bank_account: '1234' }), /holder/i);
  assert.equal(ok('upi', { upi_upi: 'name@okaxis' }).upi, 'name@okaxis');
  assert.match(err('upi', { upi_upi: 'name.okaxis' }), /UPI ID/);
  assert.match(err('crypto', { crypto_network: 'SOL', crypto_address: 'T'.repeat(34) }), /network/);
  assert.equal(describe('crypto', ok('crypto', { crypto_network: 'TRC20', crypto_address: 'T'.repeat(34) })), `TRC20 · ${'T'.repeat(34)}`);
  assert.match(err('venmo', {}), /Choose a payment method/);
  // details saved before structured methods keep their free text
  assert.equal(describe('paypal', { notes: 'old@pp.com' }), 'old@pp.com');
});

test('profile validation', () => {
  const p = profileFrom(form({ name: ' Ravi ', email: 'Ravi@Example.com', country: 'in', phone: '+91 98765 43210', website: 'https://ravi.in' }));
  assert.ok(!('error' in p));
  if (!('error' in p)) {
    assert.equal(p.name, 'Ravi');
    assert.equal(p.email, 'ravi@example.com');
    assert.equal(p.country, 'IN');
  }
  assert.ok('error' in profileFrom(form({ name: '' })));
  assert.ok('error' in profileFrom(form({ name: 'x', phone: 'call me' })));
  assert.ok('error' in profileFrom(form({ name: 'x', website: 'ravi.in' })));
});
