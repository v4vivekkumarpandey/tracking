'use server';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit, q } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';

// Note: the tracker caches links for LINK_CACHE_TTL (60s by default), so
// pausing an offer, publisher or link takes up to a minute to reach clicks.

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
// Link codes are public; 10 base62 chars are unguessable enough.
function linkCode(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
}

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect('/login');
}

export async function createAdvertiser(fd: FormData) {
  const me = await requireAdmin();
  const [row] = await q<{ id: string }>(
    `INSERT INTO advertisers (name, company, email, gstin) VALUES ($1, $2, $3, $4) RETURNING id`,
    [str(fd, 'name'), optStr(fd, 'company'), optStr(fd, 'email'), optStr(fd, 'gstin')],
  );
  await audit(me, 'create', 'advertiser', row.id);
  revalidatePath('/admin/advertisers');
}

export async function createPublisher(fd: FormData) {
  const me = await requireAdmin();
  const [row] = await q<{ id: string }>(
    `INSERT INTO publishers (name, company, email, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [str(fd, 'name'), optStr(fd, 'company'), optStr(fd, 'email')],
  );
  await audit(me, 'create', 'publisher', row.id);
  revalidatePath('/admin/publishers');
}

export async function setPublisherStatus(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd);
  const status = oneOf(str(fd, 'status'), ['pending', 'active', 'blocked'] as const);
  await q(`UPDATE publishers SET status = $2 WHERE id = $1`, [pid, status]);
  await audit(me, 'set_status', 'publisher', pid, { status });
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function createOffer(fd: FormData) {
  const me = await requireAdmin();
  const days = Number(str(fd, 'attribution_days') || 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('attribution days must be 1-365');
  const [row] = await q<{ id: string }>(
    `INSERT INTO offers (advertiser_id, name, description, destination_url, payout_model,
       default_revenue, default_payout, revenue_percent, payout_percent, attribution_days)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::numeric, 0), COALESCE($7::numeric, 0), $8, $9, $10)
     RETURNING id`,
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
  await audit(me, 'create', 'offer', row.id);
  redirect(`/admin/offers/${row.id}`);
}

export async function setOfferStatus(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd);
  const status = oneOf(str(fd, 'status'), ['active', 'paused', 'archived'] as const);
  await q(`UPDATE offers SET status = $2, updated_at = now() WHERE id = $1`, [oid, status]);
  await audit(me, 'set_status', 'offer', oid, { status });
  revalidatePath(`/admin/offers/${oid}`);
}

export async function addGoal(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const code = str(fd, 'code');
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(code)) throw new Error('goal code: letters, numbers, _ . : - only');
  await q(
    `INSERT INTO offer_goals (offer_id, code, name, revenue, payout) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (offer_id, code) DO UPDATE SET name = EXCLUDED.name, revenue = EXCLUDED.revenue, payout = EXCLUDED.payout`,
    [oid, code, str(fd, 'name') || code, optNum(fd, 'revenue'), optNum(fd, 'payout')],
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
  await q(
    `INSERT INTO publisher_offer_access (publisher_id, offer_id, status, payout_override)
     VALUES ($1, $2, 'approved', $3)
     ON CONFLICT (publisher_id, offer_id) DO UPDATE SET status = 'approved', payout_override = EXCLUDED.payout_override`,
    [pid, oid, override],
  );
  await q(
    `INSERT INTO tracking_links (code, offer_id, publisher_id)
     SELECT $1::text, $2::bigint, $3::bigint
     WHERE NOT EXISTS (SELECT 1 FROM tracking_links WHERE offer_id = $2 AND publisher_id = $3)`,
    [linkCode(), oid, pid],
  );
  await audit(me, 'approve', 'publisher_offer_access', oid, { publisher_id: pid, payout_override: override });
  revalidatePath(`/admin/offers/${oid}`);
}

export async function revokePublisher(fd: FormData) {
  const me = await requireAdmin();
  const oid = id(fd, 'offer_id');
  const pid = id(fd, 'publisher_id');
  await q(`UPDATE publisher_offer_access SET status = 'rejected' WHERE offer_id = $1 AND publisher_id = $2`, [oid, pid]);
  await audit(me, 'revoke', 'publisher_offer_access', oid, { publisher_id: pid });
  revalidatePath(`/admin/offers/${oid}`);
}

export async function addPostback(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  const offerId = str(fd, 'offer_id') ? id(fd, 'offer_id') : null;
  await q(
    `INSERT INTO publisher_postbacks (publisher_id, offer_id, goal, url) VALUES ($1, $2, $3, $4)`,
    [pid, offerId, optStr(fd, 'goal'), httpURL(str(fd, 'url'))],
  );
  await audit(me, 'add_postback', 'publisher', pid);
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function deletePostback(fd: FormData) {
  const me = await requireAdmin();
  const pid = id(fd, 'publisher_id');
  await q(`UPDATE publisher_postbacks SET active = false WHERE id = $1 AND publisher_id = $2`, [id(fd), pid]);
  await audit(me, 'disable_postback', 'publisher', pid);
  revalidatePath(`/admin/publishers/${pid}`);
}

export async function setConversionStatus(fd: FormData) {
  const me = await requireAdmin();
  const cid = id(fd);
  const status = oneOf(str(fd, 'status'), ['pending', 'approved', 'rejected'] as const);
  await q(
    `UPDATE conversions SET status = $2, reject_reason = $3, updated_at = now() WHERE id = $1`,
    [cid, status, status === 'rejected' ? optStr(fd, 'reason') : null],
  );
  await audit(me, 'set_status', 'conversion', cid, { status });
  revalidatePath('/admin/conversions');
}
