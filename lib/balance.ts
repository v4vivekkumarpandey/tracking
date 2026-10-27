import { q } from './db';
import { fromCents, pctOf, toCents } from './money';
import { getSettings, referralTerms } from './settings';

export type Balance = {
  publisher_id: number; name: string; payout_method: string | null; payout_details: string | null; payment_changed_at: Date | null;
  approved: number; pending: number; referral: number; paid: number; balance: number;
};

/**
 * Publisher earnings: approved conversions + referral commission − recorded
 * payments = what we owe. Pending conversions are shown separately; they
 * aren't payable yet.
 */
export async function balances(publisherId?: number): Promise<Balance[]> {
  const { pct, months } = referralTerms(await getSettings());
  const [rows, refs] = await Promise.all([
    q<Record<string, string | null>>(
      `SELECT p.id AS publisher_id, p.name, p.payout_method, p.payout_details, p.payment_changed_at,
              COALESCE(c.approved, 0) AS approved, COALESCE(c.pending, 0) AS pending, COALESCE(pay.paid, 0) AS paid
       FROM publishers p
       LEFT JOIN (SELECT publisher_id,
                         SUM(CASE WHEN status = 'approved' THEN payout END) AS approved,
                         SUM(CASE WHEN status = 'pending' THEN payout END) AS pending
                  FROM conversions GROUP BY publisher_id) c ON c.publisher_id = p.id
       LEFT JOIN (SELECT publisher_id, SUM(amount) AS paid FROM payments GROUP BY publisher_id) pay ON pay.publisher_id = p.id
       WHERE (? IS NULL OR p.id = ?)
       ORDER BY p.name`,
      [publisherId ?? null, publisherId ?? null],
    ),
    referralBase(months, publisherId),
  ]);
  const list = rows.map((r) => {
    const approved = toCents(r.approved ?? 0), paid = toCents(r.paid ?? 0);
    const referral = pctOf(refs.get(Number(r.publisher_id))?.approved ?? 0, pct);
    return {
      publisher_id: Number(r.publisher_id), name: String(r.name), payout_method: r.payout_method, payout_details: r.payout_details,
      payment_changed_at: (r.payment_changed_at as unknown as Date | null) ?? null,
      approved: Number(fromCents(approved)), pending: Number(r.pending ?? 0), referral: Number(fromCents(referral)),
      paid: Number(fromCents(paid)), balance: Number(fromCents(approved + referral - paid)),
    };
  });
  return list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

/**
 * Per referrer: approved/pending payouts (cents) of the publishers they
 * referred, counting only conversions within `months` of each sign-up.
 */
async function referralBase(months: number, referrerId?: number) {
  const rows = await q<{ rid: number; approved: string | null; pending: string | null }>(
    `SELECT pr.referred_by AS rid,
            SUM(CASE WHEN c.status = 'approved' THEN c.payout END) AS approved,
            SUM(CASE WHEN c.status = 'pending' THEN c.payout END) AS pending
     FROM publishers pr
     JOIN conversions c ON c.publisher_id = pr.id AND c.created_at < pr.created_at + INTERVAL ${Number(months)} MONTH
     WHERE pr.referred_by IS NOT NULL AND (? IS NULL OR pr.referred_by = ?)
     GROUP BY pr.referred_by`,
    [referrerId ?? null, referrerId ?? null],
  );
  return new Map(rows.map((r) => [Number(r.rid), { approved: toCents(r.approved ?? 0), pending: toCents(r.pending ?? 0) }]));
}

/** The publishers someone referred, with the commission each has earned them. */
export async function referralsOf(publisherId: number) {
  const { pct, months } = referralTerms(await getSettings());
  const rows = await q<{ id: number; name: string; status: string; created_at: Date; approved: string | null; pending: string | null }>(
    `SELECT pr.id, pr.name, pr.status, pr.created_at,
            SUM(CASE WHEN c.status = 'approved' THEN c.payout END) AS approved,
            SUM(CASE WHEN c.status = 'pending' THEN c.payout END) AS pending
     FROM publishers pr
     LEFT JOIN conversions c ON c.publisher_id = pr.id AND c.created_at < pr.created_at + INTERVAL ${Number(months)} MONTH
     WHERE pr.referred_by = ?
     GROUP BY pr.id, pr.name, pr.status, pr.created_at ORDER BY pr.id DESC`,
    [publisherId],
  );
  return {
    pct, months,
    rows: rows.map((r) => ({
      id: Number(r.id), name: r.name, status: r.status, joined: r.created_at,
      endsAt: new Date(new Date(r.created_at).getTime() + months * 30.44 * 86_400_000),
      commission: Number(fromCents(pctOf(toCents(r.approved ?? 0), pct))),
      pendingCommission: Number(fromCents(pctOf(toCents(r.pending ?? 0), pct))),
    })),
  };
}

export async function paymentHistory(publisherId: number) {
  return q<{ id: number; amount: string; method: string; reference: string | null; period_from: Date | null; period_to: Date | null; note: string | null; paid_at: Date }>(
    `SELECT id, amount, method, reference, period_from, period_to, note, paid_at
     FROM payments WHERE publisher_id = ? ORDER BY paid_at DESC LIMIT 100`,
    [publisherId],
  );
}
