'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit, exec, q } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { clearCapsCache } from '@/lib/caps';
import { addCreative, deleteCreative } from '@/lib/creatives';
import { addLandingPage, updateLandingPage } from '@/lib/landing';
import { clearBlockCache } from '@/lib/ipIntel';
import { parseRule } from '@/lib/ipRules';
import { refreshDomain, removeDomain, setDisabled, type DomainRow } from '@/lib/domains';
import { generateInvoices, setInvoiceStatus } from '@/lib/invoices';
import { clearLinkCache } from '@/lib/links';
import { mergePublishers } from '@/lib/merge';
import { DEFAULTS, getSettings, saveSettings, type SettingKey, type Settings } from '@/lib/settings';
import { MIN_PASSWORD, hashPassword, tempPassword } from '@/lib/password';
import { addMethod, methodLabel, removeMethod, setDefault } from '@/lib/paymentMethods';
import { profileFrom } from '@/lib/profile';
import { assertPublicUrl } from '@/lib/safeUrl';
import { RESTRICTABLE } from '@/lib/sourceLabels';

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim();
}
function optStr(fd: FormData, k: string): string | null {
  return str(fd, k) || null;
}
function optNum(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  if (!v) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`${k} must be a number`);
  return v;
}
function id(fd: FormData, k = 'id'): number {
  const n = Number(str(fd, k));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${k} is invalid`);
  return n;
}
function oneOf<T extends string>(v: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`invalid value ${v}`);
  return v as T;
}
function httpURL(v: string): string {
  const u = new URL(v);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('URL must start with http:// or https://');
  return v;
}
function randomToken(len: number, chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string {
  return Array.from(randomBytes(len), (b) => chars[b % chars.length]).join('');
}

export async function createAdvertiser(fd: FormData) {
  const me = await requireAdmin();
  const res = await exec(
    `INSERT INTO advertisers (name, company, email, tax_id, postback_secret) VALUES (?, ?, ?, ?, ?)`,
    [str(fd, 'name'), optStr(fd, 'company'), optStr(fd, 'email'), optStr(fd, 'tax_id'), randomToken(32, '0123456789abcdef')],
  );
  await audit(me, 'create', 'advertiser', res.insertId);
  revalidatePath('/admin/advertisers');
}

export async function createPublisher(fd: FormData) {
  const me = await requireAdmin();
  const country = str(fd, 'country').toUpperCase();
  const res = await exec(
    `INSERT INTO publishers (name, company, email, country, status, referral_code) VALUES (?, ?, ?, ?, 'active', ?)`,
    [str(fd, 'name'), optStr(fd, 'company'), optStr(fd, 'email'), /^[A-Z]{2}$/.test(country) ? country : null,
     randomBytes(8).toString('hex').slice(0, 10)],
  );
  await audit(me, 'create', 'publisher', res.insertId);
  revalidatePath('/admin/publishers');
}

export async function setPublisherStatus(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd);
  const status = oneOf(str(fd, 'status'), ['pending', 'active', 'blocked'] as const);
  await exec(`UPDATE publishers SET status = ? WHERE id = ?`, [status, pid]);
  await audit(me, 'set_status', 'publisher', pid, { status });
  clearLinkCache();
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function createOffer(fd: FormData) {
  const me = await requireAdmin();
  const days = Number(str(fd, 'attribution_days') || 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('attribution days must be 1-365');
  const res = await exec(
    `INSERT INTO offers (advertiser_id, name, description, destination_url, payout_model,
       default_revenue, default_payout, revenue_percent, payout_percent, attribution_days, auto_approve_days)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?, ?)`,
    [
      id(fd, 'advertiser_id'),
      str(fd, 'name'),
      optStr(fd, 'description'),
      httpURL(str(fd, 'destination_url')),
      oneOf(str(fd, 'payout_model'), ['CPA', 'CPS', 'CPL', 'CPI'] as const),
      optNum(fd, 'default_revenue'),
      optNum(fd, 'default_payout'),
      optNum(fd, 'revenue_percent'),
      optNum(fd, 'payout_percent'),
      days,
      await defaultAutoApprove(),
    ],
  );
  await audit(me, 'create', 'offer', res.insertId);
  redirect(`/admin/offers/${res.insertId}`);
}

export async function setOfferStatus(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd);
  const status = oneOf(str(fd, 'status'), ['active', 'paused', 'archived'] as const);
  await exec(`UPDATE offers SET status = ?, updated_at = NOW(3) WHERE id = ?`, [status, oid]);
  await audit(me, 'set_status', 'offer', oid, { status });
  clearLinkCache();
  revalidatePath(`/admin/offers/${oid}`);
}

export async function addGoal(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const code = str(fd, 'code');
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(code)) throw new Error('goal code: letters, numbers, _ . : - only');
  const name = str(fd, 'name') || code;
  const rev = optNum(fd, 'revenue');
  const pay = optNum(fd, 'payout');
  await exec(
    `INSERT INTO offer_goals (offer_id, code, name, revenue, payout) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = ?, revenue = ?, payout = ?`,
    [oid, code, name, rev, pay, name, rev, pay],
  );
  await audit(me, 'upsert_goal', 'offer', oid, { code });
  revalidatePath(`/admin/offers/${oid}`);
}

/** Approves a publisher on an offer and gives them a tracking link. */
export async function approvePublisher(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const pid = id(fd, 'publisher_id');
  const override = optNum(fd, 'payout_override');
  await exec(
    `INSERT INTO publisher_offer_access (publisher_id, offer_id, status, payout_override) VALUES (?, ?, 'approved', ?)
     ON DUPLICATE KEY UPDATE status = 'approved', payout_override = ?`,
    [pid, oid, override, override],
  );
  await exec(
    `INSERT INTO tracking_links (code, offer_id, publisher_id)
     SELECT ?, ?, ? FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM tracking_links WHERE offer_id = ? AND publisher_id = ?)`,
    [randomToken(10), oid, pid, oid, pid],
  );
  await audit(me, 'approve', 'publisher_offer_access', oid, { publisher_id: pid, payout_override: override });
  clearLinkCache();
  revalidatePath(`/admin/offers/${oid}`);
}

export async function revokePublisher(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const pid = id(fd, 'publisher_id');
  await exec(`UPDATE publisher_offer_access SET status = 'rejected' WHERE offer_id = ? AND publisher_id = ?`, [oid, pid]);
  await audit(me, 'revoke', 'publisher_offer_access', oid, { publisher_id: pid });
  clearLinkCache();
  revalidatePath(`/admin/offers/${oid}`);
}

export async function addPostback(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  const offerId = str(fd, 'offer_id') ? id(fd, 'offer_id') : null;
  const url = str(fd, 'url');
  await assertPublicUrl(url);
  await exec(
    `INSERT INTO publisher_postbacks (publisher_id, offer_id, goal, url) VALUES (?, ?, ?, ?)`,
    [pid, offerId, optStr(fd, 'goal'), url],
  );
  await audit(me, 'add_postback', 'publisher', pid);
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function deletePostback(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  await exec(`UPDATE publisher_postbacks SET active = 0 WHERE id = ? AND publisher_id = ?`, [id(fd), pid]);
  await audit(me, 'disable_postback', 'publisher', pid);
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function setConversionStatus(fd: FormData) {
  const me = await requireAdmin();
  const cid = id(fd);
  const status = oneOf(str(fd, 'status'), ['pending', 'approved', 'rejected'] as const);
  await exec(
    `UPDATE conversions SET status = ?, reject_reason = ?, approved_by = ?, updated_at = NOW(3) WHERE id = ?`,
    [status, status === 'rejected' ? optStr(fd, 'reason') : null, status === 'approved' ? 'admin' : null, cid],
  );
  await audit(me, 'set_status', 'conversion', cid, { status });
  revalidatePath('/admin/conversions');
}

// ---------- Edit offer ----------

const OFFER_FIELDS = [
  'name', 'destination_url', 'description', 'payout_model', 'attribution_days', 'default_revenue', 'default_payout',
  'revenue_percent', 'payout_percent', 'deeplink_enabled', 'deeplink_param', 'auto_approve_days',
  'countries', 'devices', 'daily_cap', 'monthly_cap', 'daily_budget', 'fallback_offer_id', 'fallback_url', 'blocked_sources',
] as const;
type OfferEdit = Record<(typeof OFFER_FIELDS)[number], string | number | null>;

/** Targeting, caps and fallback from the edit form (throws readable errors). */
function targeting(fd: FormData, oid: number) {
  const codes = str(fd, 'countries').toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const bad = codes.find((c) => !/^[A-Z]{2}$/.test(c));
  if (bad) throw new Error(`"${bad}" is not a 2-letter country code (e.g. US, GB, IN).`);
  const devices = fd.getAll('devices').map(String).filter((d) => ['mobile', 'tablet', 'desktop'].includes(d));
  const whole = (k: string) => {
    const v = str(fd, k);
    if (!v) return null;
    if (!/^\d{1,9}$/.test(v)) throw new Error(`${k.replace('_', ' ')} must be a whole number.`);
    return Number(v);
  };
  const fbOffer = whole('fallback_offer_id');
  if (fbOffer === oid) throw new Error('An offer cannot be its own fallback.');
  const fbUrl = str(fd, 'fallback_url');
  return {
    countries: codes.length ? [...new Set(codes)].join(',') : null,
    devices: devices.length && devices.length < 3 ? devices.join(',') : null, // none or all = no restriction
    daily_cap: whole('daily_cap'),
    monthly_cap: whole('monthly_cap'),
    daily_budget: optNum(fd, 'daily_budget'),
    fallback_offer_id: fbOffer,
    fallback_url: fbUrl ? httpURL(fbUrl) : null,
    blocked_sources: RESTRICTABLE.filter((s) => fd.getAll('blocked_sources').includes(s)).join(',') || null,
  };
}

/** Saves the offer edit form; every changed field goes to the audit log as before → after. */
export async function updateOffer(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const oid = id(fd);
  const [cur] = await q<OfferEdit>(`SELECT ${OFFER_FIELDS.join(', ')} FROM offers WHERE id = ?`, [oid]);
  if (!cur) return { error: 'Offer not found.' };

  let next: OfferEdit;
  try {
    const days = Number(str(fd, 'attribution_days') || 30);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Attribution window must be 1–365 days.');
    const auto = str(fd, 'auto_approve_days');
    if (auto && !/^\d{1,3}$/.test(auto)) throw new Error('Auto-approve days must be a whole number.');
    const param = str(fd, 'deeplink_param') || 'click_id';
    if (!/^[A-Za-z0-9_]{1,32}$/.test(param)) throw new Error('Deep-link parameter: letters, numbers and _ only.');
    const pct = (k: string) => {
      const v = optNum(fd, k);
      if (v && Number(v) > 100) throw new Error('Percentages must be 100 or less.');
      return v;
    };
    next = {
      name: str(fd, 'name') || (() => { throw new Error('Name is required.'); })(),
      destination_url: httpURL(str(fd, 'destination_url')),
      description: optStr(fd, 'description'),
      payout_model: oneOf(str(fd, 'payout_model'), ['CPA', 'CPS', 'CPL', 'CPI'] as const),
      attribution_days: days,
      default_revenue: optNum(fd, 'default_revenue') ?? '0',
      default_payout: optNum(fd, 'default_payout') ?? '0',
      revenue_percent: pct('revenue_percent'),
      payout_percent: pct('payout_percent'),
      deeplink_enabled: fd.get('deeplink_enabled') ? 1 : 0,
      deeplink_param: param,
      auto_approve_days: auto ? Number(auto) : null,
      ...targeting(fd, oid),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Compare numbers as numbers ("40.00" vs "40") and everything else as text.
  const same = (a: unknown, b: unknown) =>
    a === null || a === undefined || b === null || b === undefined ? (a ?? null) === (b ?? null)
    : !isNaN(Number(a)) && !isNaN(Number(b)) && String(a).trim() !== '' ? Number(a) === Number(b)
    : String(a) === String(b);
  const changes: Record<string, [unknown, unknown]> = {};
  for (const f of OFFER_FIELDS) if (!same(cur[f], next[f])) changes[f] = [cur[f], next[f]];
  if (Object.keys(changes).length === 0) return { ok: 'No changes.' };

  await exec(
    `UPDATE offers SET ${Object.keys(changes).map((f) => `${f} = ?`).join(', ')}, updated_at = NOW(3) WHERE id = ?`,
    [...Object.keys(changes).map((f) => next[f as keyof OfferEdit]), oid],
  );
  await audit(me, 'edit', 'offer', oid, { changes });
  clearLinkCache();
  clearCapsCache();
  revalidatePath(`/admin/offers/${oid}`);
  return { ok: `Saved ${Object.keys(changes).length} change${Object.keys(changes).length === 1 ? '' : 's'}.` };
}

export async function uploadCreativeAdmin(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const err = await addCreative(oid, fd, 'admin');
  if (err) return { error: err };
  await audit(me, 'add_creative', 'offer', oid);
  revalidatePath(`/admin/offers/${oid}`);
  return { ok: 'Added.' };
}

export async function deleteCreativeAdmin(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  await deleteCreative(id(fd), oid);
  await audit(me, 'delete_creative', 'offer', oid);
  revalidatePath(`/admin/offers/${oid}`);
}

// ---------- Landing pages ----------

export async function addLandingAdmin(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const err = await addLandingPage(oid, fd, 'admin');
  if (err) return { error: err };
  await audit(me, 'add_landing_page', 'offer', oid, { name: str(fd, 'name') });
  revalidatePath(`/admin/offers/${oid}`);
  return { ok: 'Added.' };
}

export async function updateLandingAdmin(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const err = await updateLandingPage(oid, fd);
  if (err) return { error: err };
  await audit(me, 'update_landing_page', 'offer', oid, { page: str(fd, 'lp_id'), split: str(fd, 'weight') || '0', status: str(fd, 'status') });
  revalidatePath(`/admin/offers/${oid}`);
  return { ok: 'Saved.' };
}

// ---------- IP blocklist ----------

async function insertBlock(me: string, rule: string, note: string): Promise<{ ok?: string; error?: string }> {
  const p = parseRule(rule);
  if ('error' in p) return { error: p.error };
  const res = await exec(`INSERT IGNORE INTO ip_blocks (rule, note, created_by) VALUES (?, ?, ?)`, [p.text, note.slice(0, 200) || null, me]);
  if (res.affectedRows === 0) return { error: `${p.text} is already blocked.` };
  await audit(me, 'block_ip', 'ip_block', res.insertId, { rule: p.text });
  clearBlockCache();
  revalidatePath('/admin/protection');
  return { ok: `Blocked ${p.text}. New clicks from it never reach an offer.` };
}

export async function addIpBlock(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  return insertBlock(me, str(fd, 'rule'), str(fd, 'note'));
}

/** One-click block from the protection page or the click log. */
export async function quickBlock(fd: FormData) {
  const me = await requireAdmin();
  await insertBlock(me, str(fd, 'rule'), str(fd, 'note'));
  revalidatePath('/admin/clicks');
}

export async function removeIpBlock(fd: FormData) {
  const me = await requireAdmin();
  const bid = id(fd);
  const [b] = await q<{ rule: string }>(`SELECT rule FROM ip_blocks WHERE id = ?`, [bid]);
  await exec(`DELETE FROM ip_blocks WHERE id = ?`, [bid]);
  if (b) await audit(me, 'unblock_ip', 'ip_block', bid, { rule: b.rule });
  clearBlockCache();
  revalidatePath('/admin/protection');
}

export async function deleteGoal(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const code = str(fd, 'code');
  await exec(`DELETE FROM offer_goals WHERE offer_id = ? AND code = ?`, [oid, code]);
  await audit(me, 'delete_goal', 'offer', oid, { code });
  revalidatePath(`/admin/offers/${oid}`);
}

// ---------- Approvals ----------

export async function setAdvertiserStatus(fd: FormData) {
  const me = await requireAdmin();
  const aid = id(fd);
  const status = oneOf(str(fd, 'status'), ['pending', 'active', 'paused'] as const);
  await exec(`UPDATE advertisers SET status = ? WHERE id = ?`, [status, aid]);
  await audit(me, 'set_status', 'advertiser', aid, { status });
  revalidatePath('/admin', 'layout');
}

/** Activates (or rejects) an offer an advertiser submitted, setting the publisher payout. */
export async function reviewOffer(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd);
  const decision = oneOf(str(fd, 'decision'), ['approve', 'reject'] as const);
  if (decision === 'approve') {
    const payout = optNum(fd, 'default_payout');
    const pct = optNum(fd, 'payout_percent');
    await exec(
      `UPDATE offers SET status = 'active', updated_at = NOW(3),
              default_payout = COALESCE(?, default_payout), payout_percent = COALESCE(?, payout_percent),
              auto_approve_days = COALESCE(auto_approve_days, ?)
       WHERE id = ? AND status = 'pending'`,
      [payout, pct, await defaultAutoApprove(), oid],
    );
  } else {
    await exec(`UPDATE offers SET status = 'archived', updated_at = NOW(3) WHERE id = ? AND status = 'pending'`, [oid]);
  }
  await audit(me, `offer_${decision}`, 'offer', oid);
  clearLinkCache();
  revalidatePath('/admin', 'layout');
}

export async function setOfferVisibility(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd);
  const visibility = oneOf(str(fd, 'visibility'), ['public', 'private'] as const);
  await exec(`UPDATE offers SET visibility = ?, updated_at = NOW(3) WHERE id = ?`, [visibility, oid]);
  await audit(me, 'set_visibility', 'offer', oid, { visibility });
  revalidatePath(`/admin/offers/${oid}`);
}

export async function rejectAccess(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const pid = id(fd, 'publisher_id');
  await exec(`UPDATE publisher_offer_access SET status = 'rejected' WHERE offer_id = ? AND publisher_id = ? AND status = 'pending'`, [oid, pid]);
  await audit(me, 'reject_access', 'publisher_offer_access', oid, { publisher_id: pid });
  revalidatePath('/admin', 'layout');
}

// ---------- Logins ----------

export type ResetState = { password?: string; email?: string; error?: string } | null;

/**
 * Sets a new temporary password for an advertiser's or publisher's login,
 * creating the login if the account was added by an admin. Existing sessions
 * are signed out. The password is returned once, for the admin to pass on.
 */
export async function resetLogin(_: ResetState, fd: FormData): Promise<ResetState> {
  const me = await requireAdmin();
  const role = oneOf(str(fd, 'role'), ['publisher', 'advertiser'] as const);
  const eid = id(fd);
  const table = role === 'publisher' ? 'publishers' : 'advertisers';
  const col = role === 'publisher' ? 'publisher_id' : 'advertiser_id';
  const [entity] = await q<{ email: string | null }>(`SELECT email FROM ${table} WHERE id = ?`, [eid]);
  if (!entity) return { error: 'Account not found.' };

  const password = tempPassword();
  const hash = await hashPassword(password);
  const [user] = await q<{ id: number; email: string }>(`SELECT id, email FROM users WHERE ${col} = ?`, [eid]);
  if (user) {
    await exec(`UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?`, [hash, user.id]);
  } else {
    const email = (entity.email ?? '').toLowerCase();
    if (!email) return { error: 'Add an email address to this account first.' };
    try {
      await exec(`INSERT INTO users (email, password_hash, role, ${col}) VALUES (?, ?, ?, ?)`, [email, hash, role, eid]);
    } catch {
      return { error: `Another login already uses ${email}.` };
    }
  }
  await audit(me, 'reset_login', role, eid);
  return { password, email: user?.email ?? entity.email ?? '' };
}

/** Sets a password the admin chose (creates the login if there is none yet). */
export async function setLoginPassword(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const role = oneOf(str(fd, 'role'), ['publisher', 'advertiser'] as const);
  const eid = id(fd);
  const password = String(fd.get('password') ?? '');
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password !== String(fd.get('password2') ?? '')) return { error: 'The passwords do not match.' };
  const table = role === 'publisher' ? 'publishers' : 'advertisers';
  const col = role === 'publisher' ? 'publisher_id' : 'advertiser_id';
  const [entity] = await q<{ email: string | null }>(`SELECT email FROM ${table} WHERE id = ?`, [eid]);
  if (!entity) return { error: 'Account not found.' };
  const hash = await hashPassword(password);
  const [user] = await q<{ id: number; email: string }>(`SELECT id, email FROM users WHERE ${col} = ?`, [eid]);
  let email = user?.email ?? '';
  if (user) {
    await exec(`UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?`, [hash, user.id]);
  } else {
    email = (entity.email ?? '').toLowerCase();
    if (!email) return { error: 'Add a contact email to this account first; it becomes the sign-in email.' };
    try {
      await exec(`INSERT INTO users (email, password_hash, role, ${col}) VALUES (?, ?, ?, ?)`, [email, hash, role, eid]);
    } catch {
      return { error: `Another login already uses ${email}.` };
    }
  }
  await audit(me, 'set_password', role, eid);
  revalidatePath(role === 'publisher' ? `/admin/publishers/${eid}` : '/admin/advertisers');
  return { ok: `Password set. They sign in with ${email}; existing sessions were signed out.` };
}

// ---------- Publisher profile & payment methods (admin) ----------

export async function updatePublisherProfile(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const pid = id(fd);
  const p = profileFrom(fd);
  if ('error' in p) return { error: p.error };
  await exec(
    `UPDATE publishers SET name = ?, company = ?, email = ?, website = ?, country = ?, tax_id = ?, phone = ?, messenger = ?,
                           address = ?, traffic_sources = ? WHERE id = ?`,
    [p.name, p.company, p.email, p.website, p.country, p.tax_id, p.phone, p.messenger, p.address, p.traffic_sources, pid],
  );
  const login = str(fd, 'login_email').toLowerCase();
  if (login) {
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(login)) return { error: 'Sign-in email doesn\'t look right.' };
    try {
      await exec(`UPDATE users SET email = ? WHERE publisher_id = ?`, [login, pid]);
    } catch {
      return { error: `Another login already uses ${login}.` };
    }
  }
  await audit(me, 'edit_profile', 'publisher', pid);
  revalidatePath(`/admin/publishers/${pid}`);
  return { ok: 'Profile saved.' };
}

/** Moves everything of another publisher into this one and deletes the other. */
export async function mergePublisherAction(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const into = id(fd);
  const from = Number(fd.get('from_id'));
  if (!Number.isInteger(from) || from <= 0) return { error: 'Choose the publisher to merge.' };
  if (fd.get('confirm') !== 'on') return { error: 'Tick the box to confirm. A merge can\'t be undone.' };
  let res: Awaited<ReturnType<typeof mergePublishers>>;
  try {
    res = await mergePublishers(from, into, me);
  } catch (err) {
    console.error('merge publishers', err);
    return { error: 'The merge failed and nothing was changed. Check the server log.' };
  }
  if ('error' in res) return { error: res.error };
  clearLinkCache();
  revalidatePath('/admin', 'layout');
  const login = res.login === 'moved' ? ' Their login now signs in to this account.' : res.login === 'removed' ? ' Their login was removed.' : '';
  return { ok: `Merged: ${res.links} links, ${res.clicks} clicks, ${res.conversions} conversions, ${res.payments} payments moved.${login}` };
}

export async function addPaymentMethodAdmin(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  const type = str(fd, 'type');
  const err = await addMethod(pid, type, fd, fd.get('make_default') === 'on');
  if (err) return { error: err };
  await audit(me, 'add_payment_method', 'publisher', pid, { type });
  revalidatePath(`/admin/publishers/${pid}`);
  return { ok: `${methodLabel(type)} saved.` };
}

export async function setDefaultPaymentMethodAdmin(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  if (!(await setDefault(pid, id(fd, 'method_id')))) return { error: 'Payment method not found.' };
  await audit(me, 'default_payment_method', 'publisher', pid, { id: str(fd, 'method_id') });
  revalidatePath(`/admin/publishers/${pid}`);
  return { ok: 'Default payment method changed.' };
}

export async function removePaymentMethodAdmin(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  await removeMethod(pid, id(fd));
  await audit(me, 'remove_payment_method', 'publisher', pid, { id: str(fd, 'id') });
  revalidatePath(`/admin/publishers/${pid}`);
}

// ---------- Custom domains ----------

async function domainRow(fd: FormData) {
  const [d] = await q<DomainRow>(`SELECT * FROM tracking_domains WHERE id = ?`, [id(fd)]);
  return d ?? null;
}

export async function adminCheckDomain(fd: FormData) {
  await requireAdmin();
  const d = await domainRow(fd);
  if (d) await refreshDomain(d);
  revalidatePath('/admin/domains');
}

export async function adminSetDomainDisabled(fd: FormData) {
  const me = await requireAdmin();
  const did = id(fd);
  const disabled = str(fd, 'disabled') === '1';
  await setDisabled(did, disabled);
  await audit(me, disabled ? 'disable_domain' : 'enable_domain', 'tracking_domain', did);
  revalidatePath('/admin/domains');
}

export async function adminRemoveDomain(fd: FormData) {
  const me = await requireAdmin();
  const d = await domainRow(fd);
  if (d) {
    await removeDomain(d);
    await audit(me, 'remove_domain', 'tracking_domain', d.id, { hostname: d.hostname });
  }
  revalidatePath('/admin/domains');
}

// ---------- Settings ----------

/** Settings → default auto-approve days for new offers (null = off). */
async function defaultAutoApprove(): Promise<number | null> {
  const v = Number((await getSettings()).default_auto_approve_days);
  return Number.isInteger(v) && v > 0 ? v : null;
}

export async function saveSettingsAction(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const v: Partial<Settings> = {};
  // Only fields on the submitted form: other pages save their own settings.
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) if (fd.has(k)) v[k] = str(fd, k).slice(0, 2000);
  const numeric = (k: SettingKey, max: number) => {
    if (v[k] && (!/^\d+(\.\d{1,2})?$/.test(v[k]!) || Number(v[k]) > max)) throw new Error(`${k.replace(/_/g, ' ')} must be a number up to ${max}.`);
  };
  try {
    numeric('referral_percent', 50); numeric('referral_months', 120); numeric('invoice_tax_percent', 100);
    numeric('invoice_due_days', 365); numeric('default_auto_approve_days', 365);
    if (v.datacenter_traffic !== undefined) oneOf(v.datacenter_traffic, ['flag', 'block'] as const);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await saveSettings(v);
  await audit(me, 'save_settings', 'settings', null);
  revalidatePath('/admin', 'layout');
  return { ok: 'Settings saved.' };
}

// ---------- Invoices ----------

export async function generateInvoicesAction(_: { ok?: string; error?: string } | null, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const from = str(fd, 'from'), to = str(fd, 'to');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return { error: 'Choose a valid period.' };
  const adv = str(fd, 'advertiser_id') ? id(fd, 'advertiser_id') : null;
  const res = await generateInvoices(from, to, adv);
  await audit(me, 'generate_invoices', 'invoice', null, { from, to, created: res.created });
  revalidatePath('/admin/invoices');
  return res.created.length
    ? { ok: `Created ${res.created.length} draft invoice${res.created.length === 1 ? '' : 's'}: ${res.created.join(', ')}.` }
    : { error: 'Nothing to invoice: no approved, un-invoiced conversions in that period.' };
}

export async function setInvoiceStatusAction(fd: FormData) {
  const me = await requireAdmin();
  const iid = id(fd);
  const status = oneOf(str(fd, 'status'), ['sent', 'paid', 'void'] as const);
  await setInvoiceStatus(iid, status);
  await audit(me, `invoice_${status}`, 'invoice', iid);
  revalidatePath('/admin/invoices', 'layout');
}

// ---------- Payments ----------

export async function recordPayment(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  const amount = optNum(fd, 'amount');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be positive');
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(fd, k)) ? str(fd, k) : null);
  const res = await exec(
    `INSERT INTO payments (publisher_id, amount, method, reference, period_from, period_to, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pid, amount, oneOf(str(fd, 'method'), ['paypal', 'bank', 'upi', 'payoneer', 'wise', 'crypto', 'other'] as const),
     optStr(fd, 'reference'), date('period_from'), date('period_to'), optStr(fd, 'note')],
  );
  await audit(me, 'record_payment', 'publisher', pid, { payment_id: res.insertId, amount });
  revalidatePath('/admin', 'layout');
}
