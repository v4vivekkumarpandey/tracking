import { q, tx } from './db';
import { fromCents, invoiceNumber, invoiceTotals, toCents } from './money';
import { getSettings } from './settings';

// Advertiser invoices: generated from approved conversions in a period,
// one line per offer. Each conversion carries invoice_id, so it can never
// be billed twice; voiding an invoice releases its conversions again.

export type Invoice = {
  id: number; number: string; advertiser_id: number; advertiser: string; company: string | null; tax_id: string | null; email: string | null;
  period_from: Date; period_to: Date; subtotal: string; tax_percent: string; tax_amount: string; total: string;
  status: 'draft' | 'sent' | 'paid' | 'void'; issued_at: Date | null; due_at: Date | null; paid_at: Date | null; notes: string | null; created_at: Date;
};

export async function generateInvoices(from: string, to: string, advertiserId: number | null): Promise<{ created: string[]; skipped: number }> {
  const settings = await getSettings();
  const taxPct = Math.max(0, Number(settings.invoice_tax_percent) || 0);
  const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000);
  const advs = await q<{ advertiser_id: number }>(
    `SELECT DISTINCT o.advertiser_id FROM conversions c JOIN offers o ON o.id = c.offer_id
     WHERE c.status = 'approved' AND c.invoice_id IS NULL AND c.created_at >= ? AND c.created_at < ?
       AND (? IS NULL OR o.advertiser_id = ?)`,
    [from, toExcl, advertiserId, advertiserId],
  );
  const created: string[] = [];
  let skipped = 0;
  for (const { advertiser_id } of advs) {
    const num = await tx(async (t) => {
      // Lock the advertiser's unbilled conversions so two runs can't bill them twice.
      const lines = await t.q<{ offer_id: number; name: string; n: number; amount: string }>(
        `SELECT o.id AS offer_id, o.name, COUNT(*) AS n, SUM(c.revenue) AS amount
         FROM conversions c JOIN offers o ON o.id = c.offer_id
         WHERE o.advertiser_id = ? AND c.status = 'approved' AND c.invoice_id IS NULL AND c.created_at >= ? AND c.created_at < ?
         GROUP BY o.id, o.name ORDER BY o.name FOR UPDATE`,
        [advertiser_id, from, toExcl],
      );
      const billable = lines.filter((l) => toCents(l.amount) > 0);
      if (billable.length === 0) return null;
      const totals = invoiceTotals(billable.map((l) => toCents(l.amount)), taxPct);
      const year = new Date().getUTCFullYear();
      const [{ seq }] = await t.q<{ seq: number | null }>(
        `SELECT MAX(CAST(SUBSTRING_INDEX(number, '-', -1) AS UNSIGNED)) AS seq FROM invoices WHERE number LIKE ? FOR UPDATE`, [`INV-${year}-%`],
      );
      const number = invoiceNumber(year, Number(seq ?? 0) + 1);
      const ins = await t.exec(
        `INSERT INTO invoices (number, advertiser_id, period_from, period_to, subtotal, tax_percent, tax_amount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [number, advertiser_id, from, to, fromCents(totals.subtotal), taxPct, fromCents(totals.tax), fromCents(totals.total)],
      );
      for (const l of billable) {
        await t.exec(
          `INSERT INTO invoice_lines (invoice_id, offer_id, description, quantity, amount) VALUES (?, ?, ?, ?, ?)`,
          [ins.insertId, l.offer_id, `${l.name} (${from} – ${to})`, Number(l.n), fromCents(toCents(l.amount))],
        );
      }
      await t.exec(
        `UPDATE conversions c JOIN offers o ON o.id = c.offer_id SET c.invoice_id = ?
         WHERE o.advertiser_id = ? AND c.status = 'approved' AND c.invoice_id IS NULL AND c.created_at >= ? AND c.created_at < ?`,
        [ins.insertId, advertiser_id, from, toExcl],
      );
      return number;
    });
    if (num) created.push(num); else skipped++;
  }
  return { created, skipped };
}

export async function getInvoice(id: number, advertiserId?: number) {
  const [inv] = await q<Invoice>(
    `SELECT i.*, a.name AS advertiser, a.company, a.tax_id, a.email FROM invoices i JOIN advertisers a ON a.id = i.advertiser_id
     WHERE i.id = ? AND (? IS NULL OR (i.advertiser_id = ? AND i.status IN ('sent', 'paid')))`,
    [id, advertiserId ?? null, advertiserId ?? null],
  );
  if (!inv) return null;
  const lines = await q<{ id: number; description: string; quantity: number; amount: string }>(
    `SELECT id, description, quantity, amount FROM invoice_lines WHERE invoice_id = ? ORDER BY id`, [id],
  );
  return { inv, lines };
}

export async function setInvoiceStatus(id: number, status: 'sent' | 'paid' | 'void'): Promise<void> {
  const dueDays = Math.max(0, Number((await getSettings()).invoice_due_days) || 15);
  await tx(async (t) => {
    if (status === 'sent') {
      await t.exec(
        `UPDATE invoices SET status = 'sent', issued_at = NOW(3), due_at = UTC_DATE() + INTERVAL ? DAY WHERE id = ? AND status = 'draft'`,
        [dueDays, id],
      );
    } else if (status === 'paid') {
      await t.exec(`UPDATE invoices SET status = 'paid', paid_at = NOW(3) WHERE id = ? AND status = 'sent'`, [id]);
    } else {
      // Voiding releases the conversions so they can go on a corrected invoice.
      const r = await t.exec(`UPDATE invoices SET status = 'void' WHERE id = ? AND status IN ('draft', 'sent')`, [id]);
      if (r.affectedRows) await t.exec(`UPDATE conversions SET invoice_id = NULL WHERE invoice_id = ?`, [id]);
    }
  });
}
