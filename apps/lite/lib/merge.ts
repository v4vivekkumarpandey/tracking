import { q, tx } from './db';

// Merging publisher B ("from") into A ("into"): every click, conversion,
// link, payment and setting of B moves to A, then B is deleted. B's tracking
// links keep their codes, so links already in use keep working and new clicks
// count for A.

const PROFILE = ['company', 'email', 'country', 'tax_id', 'website', 'traffic_sources', 'phone', 'messenger', 'address'];

/** The publisher a (possibly merged-away) publisher ID now belongs to. */
export async function currentPublisherId(id: number): Promise<number> {
  const [m] = await q<{ to_id: number }>(`SELECT to_id FROM publisher_merges WHERE from_id = ?`, [id]);
  return m ? Number(m.to_id) : id;
}

export type MergeResult = { clicks: number; conversions: number; links: number; payments: number; login: 'moved' | 'removed' | 'none' };

export async function mergePublishers(fromId: number, intoId: number, actor: string): Promise<MergeResult | { error: string }> {
  if (fromId === intoId) return { error: 'Choose a different publisher.' };
  return tx(async (t) => {
    // Lock both rows so two merges can't run on them at once.
    const pubs = await t.q<{ id: number; name: string; referred_by: number | null; payout_method: string | null }>(
      `SELECT id, name, referred_by, payout_method FROM publishers WHERE id IN (?, ?) FOR UPDATE`, [fromId, intoId],
    );
    const from = pubs.find((p) => Number(p.id) === fromId);
    const into = pubs.find((p) => Number(p.id) === intoId);
    if (!from || !into) return { error: 'Publisher not found.' };

    // Offer access: where both had access, keep the better status and A's payout override (else B's).
    await t.exec(
      `UPDATE publisher_offer_access a JOIN publisher_offer_access b ON b.offer_id = a.offer_id AND b.publisher_id = ?
       SET a.status = CASE WHEN 'approved' IN (a.status, b.status) THEN 'approved'
                           WHEN 'pending' IN (a.status, b.status) THEN 'pending' ELSE a.status END,
           a.payout_override = COALESCE(a.payout_override, b.payout_override)
       WHERE a.publisher_id = ?`, [fromId, intoId],
    );
    await t.exec(
      `DELETE b FROM publisher_offer_access b JOIN publisher_offer_access a ON a.offer_id = b.offer_id AND a.publisher_id = ?
       WHERE b.publisher_id = ?`, [intoId, fromId],
    );
    await t.exec(`UPDATE publisher_offer_access SET publisher_id = ? WHERE publisher_id = ?`, [intoId, fromId]);

    // Hourly stats share a key with A's rows: add them up.
    await t.exec(
      `INSERT INTO stats_hourly (hour, offer_id, publisher_id, clicks, uniques, flagged, redirected)
       SELECT b.hour, b.offer_id, ?, b.clicks, b.uniques, b.flagged, b.redirected FROM stats_hourly b WHERE b.publisher_id = ?
       ON DUPLICATE KEY UPDATE stats_hourly.clicks = stats_hourly.clicks + VALUES(clicks),
                               stats_hourly.uniques = stats_hourly.uniques + VALUES(uniques),
                               stats_hourly.flagged = stats_hourly.flagged + VALUES(flagged),
                               stats_hourly.redirected = stats_hourly.redirected + VALUES(redirected)`,
      [intoId, fromId],
    );
    await t.exec(`DELETE FROM stats_hourly WHERE publisher_id = ?`, [fromId]);

    const moved = async (table: string) =>
      (await t.exec(`UPDATE ${table} SET publisher_id = ? WHERE publisher_id = ?`, [intoId, fromId])).affectedRows;
    const links = await moved('tracking_links');
    await moved('smart_links');
    const clicks = await moved('clicks');
    const conversions = await moved('conversions');
    const payments = await moved('payments');

    // Postbacks: drop B's copies of URLs A already has, so a sale isn't reported twice.
    await t.exec(
      `DELETE b FROM publisher_postbacks b JOIN publisher_postbacks a
         ON a.publisher_id = ? AND a.url = b.url AND a.offer_id <=> b.offer_id AND a.goal <=> b.goal
       WHERE b.publisher_id = ?`, [intoId, fromId],
    );
    await moved('publisher_postbacks');

    // Payment methods move only if A has none (B's default becomes A's).
    const [{ n: methods }] = await t.q<{ n: number }>(
      `SELECT COUNT(*) AS n FROM publisher_payment_methods WHERE publisher_id = ?`, [intoId],
    );
    if (!Number(methods)) {
      if (await moved('publisher_payment_methods')) {
        await t.exec(
          `UPDATE publishers a JOIN publishers b ON b.id = ?
           SET a.payout_method = b.payout_method, a.payout_details = b.payout_details, a.payment_changed_at = NOW(3)
           WHERE a.id = ?`, [fromId, intoId],
        );
      }
    }

    await t.exec(`UPDATE tracking_domains SET owner_id = ? WHERE owner_type = 'publisher' AND owner_id = ?`, [intoId, fromId]);

    // Referrals: B's referrals become A's; A keeps its own referrer, or takes B's.
    await t.exec(`UPDATE publishers SET referred_by = ? WHERE referred_by = ? AND id <> ?`, [intoId, fromId, intoId]);
    const fromRef = from.referred_by === null ? null : Number(from.referred_by);
    const intoRef = into.referred_by === null ? null : Number(into.referred_by);
    let newRef = intoRef === fromId ? fromRef : intoRef ?? fromRef;
    if (newRef === intoId) newRef = null;
    await t.exec(
      `UPDATE publishers a JOIN publishers b ON b.id = ?
       SET ${PROFILE.map((c) => `a.${c} = COALESCE(NULLIF(a.${c}, ''), b.${c})`).join(', ')}, a.referred_by = ?
       WHERE a.id = ?`, [fromId, newRef, intoId],
    );

    // Login: B's sign-in moves to A only if A has none; otherwise it's removed.
    const [intoLogin] = await t.q<{ id: number }>(`SELECT id FROM users WHERE publisher_id = ? LIMIT 1`, [intoId]);
    let login: MergeResult['login'] = 'none';
    if (intoLogin) {
      if ((await t.exec(`DELETE FROM users WHERE publisher_id = ?`, [fromId])).affectedRows) login = 'removed';
    } else if ((await t.exec(
      `UPDATE users SET publisher_id = ?, session_version = session_version + 1 WHERE publisher_id = ?`, [intoId, fromId],
    )).affectedRows) login = 'moved';

    // Old click IDs name B: point B (and anything merged into B before) at A.
    await t.exec(`UPDATE publisher_merges SET to_id = ? WHERE to_id = ?`, [intoId, fromId]);
    await t.exec(
      `INSERT INTO publisher_merges (from_id, to_id, from_name, merged_by) VALUES (?, ?, ?, ?)`,
      [fromId, intoId, from.name, actor],
    );

    await t.exec(`DELETE FROM publisher_payment_methods WHERE publisher_id = ?`, [fromId]);
    await t.exec(`DELETE FROM publishers WHERE id = ?`, [fromId]);
    await t.exec(
      `INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, 'merge_publisher', 'publisher', ?, ?)`,
      [actor, intoId, JSON.stringify({ from_id: fromId, from_name: from.name, clicks, conversions, links, payments, login })],
    );
    return { clicks, conversions, links, payments, login };
  });
}
