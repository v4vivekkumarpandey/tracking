// Exact money arithmetic in integer cents (pure, unit-tested). Used for
// referral commissions and invoice totals so rounding is predictable.

export const toCents = (v: string | number) => Math.round(Number(v) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

/** Percentage of an amount, rounded half-up to the cent. */
export function pctOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

/** Invoice totals from line amounts (cents) and a tax percentage. */
export function invoiceTotals(lineCents: number[], taxPct: number) {
  const subtotal = lineCents.reduce((a, b) => a + b, 0);
  const tax = pctOf(subtotal, taxPct);
  return { subtotal, tax, total: subtotal + tax };
}

/** "INV-2026-0007" from the year and a sequence number. */
export function invoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}
