'use server';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit, exec } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { clearLinkCache } from '@/lib/links';
import { SESSION_COOKIE } from '@/lib/session';

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

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
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
    `INSERT INTO publishers (name, company, email, country, status) VALUES (?, ?, ?, ?, 'active')`,
    [str(fd, 'name'), optStr(fd, 'company'), optStr(fd, 'email'), /^[A-Z]{2}$/.test(country) ? country : null],
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
       default_revenue, default_payout, revenue_percent, payout_percent, attribution_days)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?)`,
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
  await exec(
    `INSERT INTO publisher_postbacks (publisher_id, offer_id, goal, url) VALUES (?, ?, ?, ?)`,
    [pid, offerId, optStr(fd, 'goal'), httpURL(str(fd, 'url'))],
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
    `UPDATE conversions SET status = ?, reject_reason = ?, updated_at = NOW(3) WHERE id = ?`,
    [status, status === 'rejected' ? optStr(fd, 'reason') : null, cid],
  );
  await audit(me, 'set_status', 'conversion', cid, { status });
  revalidatePath('/admin/conversions');
}
