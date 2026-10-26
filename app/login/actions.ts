'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requestIp, startSession } from '@/lib/auth';
import { exec, q } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { allow, clear } from '@/lib/ratelimit';

const digest = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'));

export async function login(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const key = `login:${await requestIp()}:${email}`;
  if (!allow(key, 10, 15 * 60_000)) redirect('/login?error=limit');

  // 1. The single admin account from environment variables.
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? '';
  if (adminEmail && adminPassword && same(email, adminEmail) && same(password, adminPassword)) {
    clear(key);
    await startSession('admin');
    redirect('/admin');
  }

  // 2. Advertiser and publisher users.
  const [u] = await q<{ id: number; password_hash: string; role: string; session_version: number; status: string | null }>(
    `SELECT u.id, u.password_hash, u.role, u.session_version, COALESCE(p.status, a.status) AS status
     FROM users u
     LEFT JOIN publishers p  ON p.id = u.publisher_id AND u.role = 'publisher'
     LEFT JOIN advertisers a ON a.id = u.advertiser_id AND u.role = 'advertiser'
     WHERE u.email = ?`,
    [email],
  );
  // Unknown emails still pay for one hash, so response time doesn't reveal
  // which emails are registered.
  const ok = await verifyPassword(password, u?.password_hash ?? (await dummyHash()));
  if (!u || !ok) redirect('/login?error=1');
  clear(key);

  if (u.status === 'pending') redirect('/login?error=pending');
  if (u.status !== 'active') redirect('/login?error=blocked');

  await exec(`UPDATE users SET last_login_at = NOW(3) WHERE id = ?`, [u.id]);
  await startSession(`u:${u.id}:${u.session_version}`);
  redirect(u.role === 'advertiser' ? '/advertiser' : '/publisher');
}
