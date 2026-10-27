'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureLinks } from '@/lib/access';
import { LISTED } from '@/lib/offerInfo';
import { traceLink, type TestDevice, type Trace } from '@/lib/linkTest';
import { changePassword as change, type FormState } from '@/lib/account';
import { requirePublisher } from '@/lib/auth';
import { audit, exec, q } from '@/lib/db';
import { addDomain, ownedDomain, refreshDomain, removeDomain } from '@/lib/domains';
import { expand } from '@/lib/macros';
import { deliver } from '@/lib/outbox';
import { assertPublicUrl } from '@/lib/safeUrl';
import { SUB_FIELDS } from '@/lib/subs';
import { verifyPassword } from '@/lib/password';
import { addMethod, methodLabel, removeMethod, setDefault } from '@/lib/paymentMethods';
import { profileFrom } from '@/lib/profile';

// Every action takes the publisher from the session (requirePublisher) and
// re-checks ownership in SQL. IDs from the form are never trusted alone.

const str = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);
const intId = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${k} is invalid`);
  return n;
};

/**
 * Asks to run an offer. "Public, instant link" offers approve at once and
 * create the tracking link; offers with required terms need the box ticked.
 */
export async function requestAccess(fd: FormData) {
  const me = await requirePublisher();
  const oid = intId(fd, 'offer_id');
  const [offer] = await q<{ visibility: string; require_terms: number }>(
    `SELECT visibility, require_terms FROM offers WHERE id = ? AND status = 'active' AND visibility IN ${LISTED}`, [oid],
  );
  if (!offer) throw new Error('This offer is not available.');
  const accepted = fd.get('accept_terms') === 'on';
  if (Number(offer.require_terms) && !accepted) redirect(`/publisher/offers/${oid}?terms=required`);
  const instant = offer.visibility === 'open';
  // A no-op if a request (or a decision) already exists: no re-request spam.
  await exec(
    `INSERT INTO publisher_offer_access (publisher_id, offer_id, status, terms_accepted_at) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE publisher_id = publisher_id`,
    [me.publisherId, oid, instant ? 'approved' : 'pending', accepted ? new Date() : null],
  );
  if (instant) await ensureLinks(oid);
  await audit(`publisher:${me.publisherId}`, instant ? 'instant_access' : 'request_access', 'offer', oid, accepted ? { terms_accepted: true } : undefined);
  revalidatePath('/publisher/offers', 'layout');
  if (instant) redirect(`/publisher/offers/${oid}`);
}

export async function linkTestPublisher(_: Trace, fd: FormData): Promise<Trace> {
  const me = await requirePublisher();
  return traceLink(str(fd, 'url', 2000), me.publisherId, str(fd, 'device', 16) as TestDevice);
}

export async function addPostback(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  const url = str(fd, 'url', 2000);
  try {
    await assertPublicUrl(url);
  } catch (e) {
    return { error: (e as Error).message };
  }
  let offerId: number | null = null;
  if (str(fd, 'offer_id')) {
    offerId = intId(fd, 'offer_id');
    const [ok] = await q(`SELECT 1 FROM publisher_offer_access WHERE publisher_id = ? AND offer_id = ? AND status = 'approved'`, [me.publisherId, offerId]);
    if (!ok) return { error: 'You can only add postbacks for offers you are approved on.' };
  }
  const goal = str(fd, 'goal', 64);
  if (goal && !/^[A-Za-z0-9_.:-]+$/.test(goal)) return { error: 'Goal code can only contain letters, numbers and _ . : -' };
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM publisher_postbacks WHERE publisher_id = ? AND active = 1`, [me.publisherId]);
  if (Number(n) >= 20) return { error: 'You can have up to 20 active postbacks.' };

  await exec(`INSERT INTO publisher_postbacks (publisher_id, offer_id, goal, url) VALUES (?, ?, ?, ?)`, [me.publisherId, offerId, goal || null, url]);
  await audit(`publisher:${me.publisherId}`, 'add_postback', 'publisher', me.publisherId);
  revalidatePath('/publisher/postbacks');
  return { ok: 'Postback added.' };
}

export async function disablePostback(fd: FormData) {
  const me = await requirePublisher();
  await exec(`UPDATE publisher_postbacks SET active = 0 WHERE id = ? AND publisher_id = ?`, [intId(fd, 'id'), me.publisherId]);
  revalidatePath('/publisher/postbacks');
}

export type TestState = { url?: string; status?: number | null; body?: string; error?: string | null } | null;

/** Fires one postback with sample values so publishers can check their endpoint. */
export async function testPostback(_: TestState, fd: FormData): Promise<TestState> {
  const me = await requirePublisher();
  const [pb] = await q<{ url: string }>(`SELECT url FROM publisher_postbacks WHERE id = ? AND publisher_id = ? AND active = 1`, [intId(fd, 'id'), me.publisherId]);
  if (!pb) return { error: 'Postback not found.' };
  const url = expand(pb.url, {
    click_id: 'test-click-id', conversion_id: '0', offer_id: '0', pub_id: String(me.publisherId), goal: 'test',
    txn_id: 'TEST', amount: '100.00', payout: '1.00', status: 'test',
    ...Object.fromEntries(SUB_FIELDS.map((k) => [k, `test-${k.replace('_', '-')}`])),
  });
  const res = await deliver(url);
  return { url, status: res.status, body: res.body.slice(0, 300), error: res.error };
}

export async function updateAccount(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  const p = profileFrom(fd);
  if ('error' in p) return { error: p.error };
  await exec(
    `UPDATE publishers SET name = ?, company = ?, email = ?, website = ?, country = ?, tax_id = ?, phone = ?, messenger = ?,
                           address = ?, traffic_sources = ? WHERE id = ?`,
    [p.name, p.company, p.email, p.website, p.country, p.tax_id, p.phone, p.messenger, p.address, p.traffic_sources, me.publisherId],
  );
  await audit(`publisher:${me.publisherId}`, 'update_account', 'publisher', me.publisherId);
  revalidatePath('/publisher', 'layout');
  return { ok: 'Saved.' };
}

// ---- Payment methods: adding or switching one needs the account password,
// so a stolen session can't redirect payouts. ----

async function confirmPassword(userId: number, fd: FormData): Promise<boolean> {
  const [u] = await q<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
  return !!u && verifyPassword(String(fd.get('current') ?? ''), u.password_hash);
}

export async function addPaymentMethod(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  if (!(await confirmPassword(me.userId, fd))) return { error: 'Your password is wrong.' };
  const type = str(fd, 'type', 16);
  const err = await addMethod(me.publisherId, type, fd, fd.get('make_default') === 'on');
  if (err) return { error: err };
  await audit(`publisher:${me.publisherId}`, 'add_payment_method', 'publisher', me.publisherId, { type });
  revalidatePath('/publisher', 'layout');
  return { ok: `${methodLabel(type)} saved.` };
}

export async function setDefaultPaymentMethod(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  if (!(await confirmPassword(me.userId, fd))) return { error: 'Your password is wrong.' };
  if (!(await setDefault(me.publisherId, intId(fd, 'method_id')))) return { error: 'Payment method not found.' };
  await audit(`publisher:${me.publisherId}`, 'default_payment_method', 'publisher', me.publisherId, { id: str(fd, 'method_id') });
  revalidatePath('/publisher', 'layout');
  return { ok: 'Default payment method changed.' };
}

export async function removePaymentMethod(fd: FormData) {
  const me = await requirePublisher();
  await removeMethod(me.publisherId, intId(fd, 'id'));
  await audit(`publisher:${me.publisherId}`, 'remove_payment_method', 'publisher', me.publisherId, { id: str(fd, 'id') });
  revalidatePath('/publisher', 'layout');
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  return change(me.userId, fd);
}

// ---- Smart links ----

export async function createSmartLink(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  const name = str(fd, 'name', 200) || 'Smart link';
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM smart_links WHERE publisher_id = ? AND status = 'active'`, [me.publisherId]);
  if (Number(n) >= 20) return { error: 'You can have up to 20 smart links.' };
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
  await exec(`INSERT INTO smart_links (code, publisher_id, name) VALUES (?, ?, ?)`, [code, me.publisherId, name]);
  revalidatePath('/publisher/smartlinks');
  return { ok: 'Smart link created.' };
}

export async function deleteSmartLink(fd: FormData) {
  const me = await requirePublisher();
  await exec(`UPDATE smart_links SET status = 'deleted' WHERE id = ? AND publisher_id = ?`, [intId(fd, 'id'), me.publisherId]);
  revalidatePath('/publisher/smartlinks');
}

// ---- Custom tracking domains (owner always taken from the session) ----

export async function addDomainAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requirePublisher();
  const res = await addDomain({ type: 'publisher', id: me.publisherId }, str(fd, 'hostname', 300));
  revalidatePath('/publisher/domains');
  return res;
}

export async function checkDomainAction(fd: FormData) {
  const me = await requirePublisher();
  const d = await ownedDomain(intId(fd, 'id'), { type: 'publisher', id: me.publisherId });
  if (d) await refreshDomain(d);
  revalidatePath('/publisher/domains');
}

export async function removeDomainAction(fd: FormData) {
  const me = await requirePublisher();
  const d = await ownedDomain(intId(fd, 'id'), { type: 'publisher', id: me.publisherId });
  if (d) await removeDomain(d);
  revalidatePath('/publisher/domains');
}
