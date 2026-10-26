import { q } from './db';

export type Balance = {
  publisher_id: number; name: string; payout_method: string | null; payout_details: string | null;
  approved: number; pending: number; paid: number; balance: number;
};

/**
 * Publisher earnings: approved conversions minus recorded payments = what we
 * owe. Pending conversions are shown separately; they aren't payable yet.
 */
export async function balances(publisherId?: number): Promise<Balance[]> {
  const rows = await q<Record<string, string | null>>(
    `SELECT p.id AS publisher_id, p.name, p.payout_method, p.payout_details,
            COALESCE(c.approved, 0) AS approved, COALESCE(c.pending, 0) AS pending, COALESCE(pay.paid, 0) AS paid
     FROM publishers p
     LEFT JOIN (SELECT publisher_id,
                       SUM(CASE WHEN status = 'approved' THEN payout END) AS approved,
                       SUM(CASE WHEN status = 'pending' THEN payout END) AS pending
                FROM conversions GROUP BY publisher_id) c ON c.publisher_id = p.id
     LEFT JOIN (SELECT publisher_id, SUM(amount) AS paid FROM payments GROUP BY publisher_id) pay ON pay.publisher_id = p.id
     WHERE (? IS NULL OR p.id = ?)
     ORDER BY (COALESCE(c.approved, 0) - COALESCE(pay.paid, 0)) DESC, p.name`,
    [publisherId ?? null, publisherId ?? null],
  );
  return rows.map((r) => {
    const approved = Number(r.approved), paid = Number(r.paid);
    return {
      publisher_id: Number(r.publisher_id), name: String(r.name), payout_method: r.payout_method, payout_details: r.payout_details,
      approved, pending: Number(r.pending), paid, balance: Math.round((approved - paid) * 100) / 100,
    };
  });
}

export async function paymentHistory(publisherId: number) {
  return q<{ id: number; amount: string; method: string; reference: string | null; period_from: Date | null; period_to: Date | null; note: string | null; paid_at: Date }>(
    `SELECT id, amount, method, reference, period_from, period_to, note, paid_at
     FROM payments WHERE publisher_id = ? ORDER BY paid_at DESC LIMIT 100`,
    [publisherId],
  );
}
