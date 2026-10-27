// Payout method types and their fields (pure: also used by the browser form).

export type Field = { k: string; label: string; required?: boolean; re?: RegExp; hint?: string; options?: string[]; upper?: boolean };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

export const METHOD_TYPES: Record<string, { label: string; fields: Field[] }> = {
  paypal: { label: 'PayPal', fields: [{ k: 'email', label: 'PayPal email', required: true, re: EMAIL }] },
  bank: {
    label: 'Bank transfer',
    fields: [
      { k: 'holder', label: 'Account holder name', required: true, re: /^.{2,100}$/ },
      { k: 'bank', label: 'Bank name', required: true, re: /^.{2,100}$/ },
      { k: 'account', label: 'Account number / IBAN', required: true, re: /^[A-Za-z0-9 -]{4,40}$/, upper: true },
      { k: 'code', label: 'IFSC / SWIFT / routing code', re: /^[A-Za-z0-9]{4,15}$/, upper: true, hint: 'IFSC for India, SWIFT/BIC abroad' },
      { k: 'country', label: 'Bank country (2 letters)', re: /^[A-Za-z]{2}$/, upper: true },
    ],
  },
  upi: { label: 'UPI (India)', fields: [{ k: 'upi', label: 'UPI ID', required: true, re: /^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,32}$/, hint: 'e.g. name@okaxis' }] },
  payoneer: { label: 'Payoneer', fields: [{ k: 'email', label: 'Payoneer email', required: true, re: EMAIL }] },
  wise: { label: 'Wise', fields: [{ k: 'email', label: 'Wise email', required: true, re: EMAIL }] },
  crypto: {
    label: 'Crypto (USDT)',
    fields: [
      { k: 'network', label: 'Network', required: true, options: ['TRC20', 'ERC20', 'BEP20'] },
      { k: 'address', label: 'Wallet address', required: true, re: /^[A-Za-z0-9]{20,100}$/ },
    ],
  },
  other: { label: 'Other', fields: [{ k: 'notes', label: 'Payment instructions', required: true, re: /^[\s\S]{3,500}$/ }] },
};

export const methodLabel = (type: string) => METHOD_TYPES[type]?.label ?? type;

/** Validated details for `type` from a form, or an error message. */
export function parseMethod(type: string, fd: FormData): { details: Record<string, string> } | { error: string } {
  const def = METHOD_TYPES[type];
  if (!def) return { error: 'Choose a payment method.' };
  const details: Record<string, string> = {};
  for (const f of def.fields) {
    let v = String(fd.get(`${type}_${f.k}`) ?? '').trim();
    if (f.upper) v = v.toUpperCase();
    if (!v) {
      if (f.required) return { error: `${f.label} is required.` };
      continue;
    }
    if (f.options && !f.options.includes(v)) return { error: `Choose a valid ${f.label.toLowerCase()}.` };
    if (f.re && !f.re.test(v)) return { error: `${f.label} doesn't look right.` };
    details[f.k] = v;
  }
  return { details };
}

/** One line for payment lists, e.g. "Bank transfer · A Kumar · HDFC · 1234… · HDFC0001234". */
export function describe(type: string, details: Record<string, string>): string {
  const def = METHOD_TYPES[type];
  if (!def) return Object.values(details).join(' · ');
  const known = def.fields.map((f) => details[f.k]).filter(Boolean);
  // Methods saved before structured fields keep their old free text in "notes".
  const legacy = details.notes && type !== 'other' ? [details.notes] : [];
  return [...known, ...legacy].join(' · ');
}
