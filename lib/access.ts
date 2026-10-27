import { randomBytes } from 'node:crypto';
import { exec } from './db';
import { clearLinkCache } from './links';

const CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from(randomBytes(10), (b) => CHARS[b % CHARS.length]).join('');

/** Gives each publisher with approved access to the offer a tracking link (keeps existing ones). */
export async function ensureLinks(offerId: number): Promise<void> {
  const res = await exec(
    `INSERT INTO tracking_links (code, offer_id, publisher_id)
     SELECT CONCAT(?, a.publisher_id), a.offer_id, a.publisher_id FROM publisher_offer_access a
     WHERE a.offer_id = ? AND a.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM tracking_links l WHERE l.offer_id = a.offer_id AND l.publisher_id = a.publisher_id)`,
    [code(), offerId],
  );
  if (res.affectedRows) clearLinkCache();
}

/**
 * For "Public, instant link" offers: approves waiting requests (those that
 * accepted the terms, if the offer requires them) and creates their links.
 */
export async function approveWaiting(offerId: number): Promise<number> {
  const res = await exec(
    `UPDATE publisher_offer_access a JOIN offers o ON o.id = a.offer_id
     SET a.status = 'approved'
     WHERE a.offer_id = ? AND a.status = 'pending' AND (o.require_terms = 0 OR a.terms_accepted_at IS NOT NULL)`,
    [offerId],
  );
  await ensureLinks(offerId);
  return res.affectedRows;
}
