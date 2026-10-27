import { exec, q } from './db';
import { describe, parseMethod } from './paymentTypes';

export { METHOD_TYPES, describe, methodLabel, parseMethod } from './paymentTypes';

// Publisher payout methods: a few saved methods per publisher, one default.
// The default is mirrored into publishers.payout_method / payout_details,
// which the Payments pages and balances already read.

export type PaymentMethod = { id: number; type: string; details: Record<string, string>; is_default: number; created_at: Date };

export async function methodsOf(publisherId: number): Promise<PaymentMethod[]> {
  const rows = await q<{ id: number; type: string; details: string; is_default: number; created_at: Date }>(
    `SELECT id, type, details, is_default, created_at FROM publisher_payment_methods WHERE publisher_id = ? ORDER BY is_default DESC, id`,
    [publisherId],
  );
  return rows.map((r) => {
    let details: Record<string, string> = {};
    try { details = JSON.parse(r.details); } catch { /* keep empty */ }
    return { ...r, details };
  });
}

const MAX_METHODS = 5;

export async function addMethod(publisherId: number, type: string, fd: FormData, makeDefault: boolean): Promise<string | null> {
  const p = parseMethod(type, fd);
  if ('error' in p) return p.error;
  const existing = await methodsOf(publisherId);
  if (existing.length >= MAX_METHODS) return `You can save up to ${MAX_METHODS} payment methods. Remove one first.`;
  const res = await exec(
    `INSERT INTO publisher_payment_methods (publisher_id, type, details, is_default) VALUES (?, ?, ?, 0)`,
    [publisherId, type, JSON.stringify(p.details)],
  );
  if (makeDefault || existing.length === 0) await setDefault(publisherId, res.insertId);
  return null;
}

export async function setDefault(publisherId: number, methodId: number): Promise<boolean> {
  const res = await exec(
    `UPDATE publisher_payment_methods SET is_default = (id = ?) WHERE publisher_id = ?`, [methodId, publisherId],
  );
  if (!res.affectedRows) return false;
  await syncDefault(publisherId);
  return true;
}

export async function removeMethod(publisherId: number, methodId: number): Promise<void> {
  await exec(`DELETE FROM publisher_payment_methods WHERE id = ? AND publisher_id = ?`, [methodId, publisherId]);
  // Removing the default promotes the oldest remaining method.
  const rest = await methodsOf(publisherId);
  if (rest.length && !rest.some((m) => Number(m.is_default))) {
    await exec(`UPDATE publisher_payment_methods SET is_default = 1 WHERE id = ?`, [rest[0].id]);
  }
  await syncDefault(publisherId);
}

/** Mirrors the default method into publishers.payout_* and stamps when payment details last changed. */
async function syncDefault(publisherId: number) {
  const def = (await methodsOf(publisherId)).find((m) => Number(m.is_default));
  const [cur] = await q<{ payout_method: string | null; payout_details: string | null }>(
    `SELECT payout_method, payout_details FROM publishers WHERE id = ?`, [publisherId],
  );
  const method = def?.type ?? null;
  const details = def ? describe(def.type, def.details) : null;
  if (cur && cur.payout_method === method && cur.payout_details === details) return;
  await exec(
    `UPDATE publishers SET payout_method = ?, payout_details = ?, payment_changed_at = NOW(3) WHERE id = ?`,
    [method, details, publisherId],
  );
}
