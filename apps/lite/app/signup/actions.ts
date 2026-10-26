'use server';

import { redirect } from 'next/navigation';
import { requestIp } from '@/lib/auth';
import { isDuplicate, tx } from '@/lib/db';
import { MIN_PASSWORD, hashPassword } from '@/lib/password';
import { allow } from '@/lib/ratelimit';
import { randomBytes } from 'node:crypto';

export type SignupState = { error?: string } | null;

const s = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max);

function common(fd: FormData): { email: string; password: string; website: string | null } | string {
  // Honeypot: hidden from people, filled in by bots.
  if (s(fd, 'fax')) return 'Something went wrong. Please try again.';
  const email = s(fd, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  const password = String(fd.get('password') ?? '');
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password !== String(fd.get('password2') ?? '')) return 'The two passwords do not match.';
  const website = s(fd, 'website', 255);
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+/.test(website)) return 'Website must start with http:// or https://';
  return { email, password, website: website || null };
}

async function rateLimited(): Promise<boolean> {
  return !allow(`signup:${await requestIp()}`, 5, 60 * 60_000);
}

export async function signupPublisher(_: SignupState, fd: FormData): Promise<SignupState> {
  if (await rateLimited()) return { error: 'Too many sign-ups from your network. Please try again later.' };
  const c = common(fd);
  if (typeof c === 'string') return { error: c };
  const name = s(fd, 'name');
  const traffic = s(fd, 'traffic_sources', 2000);
  const country = s(fd, 'country', 2).toUpperCase();
  if (!name) return { error: 'Please enter your name.' };
  if (!traffic) return { error: 'Please tell us how you will promote offers.' };

  const hash = await hashPassword(c.password);
  try {
    await tx(async (t) => {
      const p = await t.exec(
        `INSERT INTO publishers (name, company, email, country, website, traffic_sources, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [name, s(fd, 'company') || null, c.email, /^[A-Z]{2}$/.test(country) ? country : null, c.website, traffic],
      );
      await t.exec(
        `INSERT INTO users (email, password_hash, role, publisher_id) VALUES (?, ?, 'publisher', ?)`,
        [c.email, hash, p.insertId],
      );
    });
  } catch (err) {
    if (isDuplicate(err)) return { error: 'An account with this email already exists. Try signing in.' };
    throw err;
  }
  redirect('/login?signup=1');
}

export async function signupAdvertiser(_: SignupState, fd: FormData): Promise<SignupState> {
  if (await rateLimited()) return { error: 'Too many sign-ups from your network. Please try again later.' };
  const c = common(fd);
  if (typeof c === 'string') return { error: c };
  const name = s(fd, 'name');
  const company = s(fd, 'company');
  if (!name || !company) return { error: 'Please enter your name and company.' };

  const hash = await hashPassword(c.password);
  try {
    await tx(async (t) => {
      const a = await t.exec(
        `INSERT INTO advertisers (name, company, email, website, postback_secret, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [name, company, c.email, c.website, randomBytes(16).toString('hex')],
      );
      await t.exec(
        `INSERT INTO users (email, password_hash, role, advertiser_id) VALUES (?, ?, 'advertiser', ?)`,
        [c.email, hash, a.insertId],
      );
    });
  } catch (err) {
    if (isDuplicate(err)) return { error: 'An account with this email already exists. Try signing in.' };
    throw err;
  }
  redirect('/login?signup=1');
}
