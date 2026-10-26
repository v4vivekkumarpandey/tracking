'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { changePassword as change, type FormState } from '@/lib/account';
import { requireAdvertiser } from '@/lib/auth';
import { audit, exec } from '@/lib/db';

// Every action takes the advertiser from the session (requireAdvertiser) and
// limits writes to rows belonging to that advertiser's offers.

const str = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);
const num = (v: string) => (/^\d{1,10}(\.\d{1,2})?$/.test(v) ? v : null);

export async function submitOffer(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdvertiser();
  const name = str(fd, 'name', 200);
  const url = str(fd, 'destination_url', 2000);
  if (!name) return { error: 'Offer name is required.' };
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
  } catch {
    return { error: 'Landing page URL must start with http:// or https://' };
  }
  if (!url.includes('{click_id}')) {
    return { error: 'The landing page URL must contain {click_id}, e.g. https://yoursite.com/?click_id={click_id}, so you can report conversions back to us.' };
  }
  const model = str(fd, 'payout_model');
  if (!['CPA', 'CPS', 'CPL', 'CPI'].includes(model)) return { error: 'Choose a payout model.' };
  const pricing = str(fd, 'pricing');
  const amount = num(str(fd, 'amount'));
  if (!amount || Number(amount) <= 0) return { error: 'Enter what you pay per conversion (or the % of sale).' };
  if (pricing === 'percent' && Number(amount) > 100) return { error: 'Percentage must be 100 or less.' };
  const days = Number(str(fd, 'attribution_days') || 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: 'Attribution window must be 1–365 days.' };

  const res = await exec(
    `INSERT INTO offers (advertiser_id, name, description, destination_url, payout_model,
                         default_revenue, revenue_percent, default_payout, attribution_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending')`,
    [me.advertiserId, name, str(fd, 'description', 5000) || null, url, model,
     pricing === 'percent' ? 0 : amount, pricing === 'percent' ? amount : null, days],
  );
  await audit(`advertiser:${me.advertiserId}`, 'submit_offer', 'offer', res.insertId);
  redirect(`/advertiser/offers/${res.insertId}?submitted=1`);
}

// One action per button: React 19 doesn't pass the clicked button's
// name/value in the form data, so a shared "status" button field can't work.
export async function approveConversions(fd: FormData) {
  await reviewConversions(fd, 'approved');
}

export async function rejectConversions(fd: FormData) {
  await reviewConversions(fd, 'rejected');
}

/** Approve or reject one or many conversions (checkboxes named "ids"). */
async function reviewConversions(fd: FormData, status: 'approved' | 'rejected') {
  const me = await requireAdvertiser();
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (ids.length === 0) return;
  const reason = status === 'rejected' ? str(fd, 'reason', 255) || null : null;
  const res = await exec(
    `UPDATE conversions c JOIN offers o ON o.id = c.offer_id
     SET c.status = ?, c.reject_reason = ?, c.updated_at = NOW(3)
     WHERE c.id IN (${ids.map(() => '?').join(',')}) AND o.advertiser_id = ?`,
    [status, reason, ...ids, me.advertiserId],
  );
  await audit(`advertiser:${me.advertiserId}`, `conversions_${status}`, 'advertiser', me.advertiserId, { count: res.affectedRows });
  revalidatePath('/advertiser', 'layout');
}

export async function regenerateSecret() {
  const me = await requireAdvertiser();
  await exec(`UPDATE advertisers SET postback_secret = ? WHERE id = ?`, [randomBytes(16).toString('hex'), me.advertiserId]);
  await audit(`advertiser:${me.advertiserId}`, 'regenerate_secret', 'advertiser', me.advertiserId);
  revalidatePath('/advertiser/integration');
}

export async function updateAccount(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdvertiser();
  const name = str(fd, 'name', 200);
  const company = str(fd, 'company', 200);
  if (!name || !company) return { error: 'Name and company are required.' };
  const website = str(fd, 'website', 255);
  if (website && !/^https?:\/\/\S+\.\S+/.test(website)) return { error: 'Website must start with http:// or https://' };
  await exec(
    `UPDATE advertisers SET name = ?, company = ?, website = ?, tax_id = ? WHERE id = ?`,
    [name, company, website || null, str(fd, 'tax_id', 64) || null, me.advertiserId],
  );
  revalidatePath('/advertiser', 'layout');
  return { ok: 'Saved.' };
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdvertiser();
  return change(me.userId, fd);
}
