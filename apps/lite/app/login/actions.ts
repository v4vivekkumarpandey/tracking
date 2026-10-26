'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSession } from '@/lib/session';

const digest = (s: string) => createHash('sha256').update(s).digest();

export async function login(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const wantEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase();
  const wantPassword = process.env.ADMIN_PASSWORD ?? '';

  const ok =
    wantEmail !== '' &&
    wantPassword !== '' &&
    timingSafeEqual(digest(email), digest(wantEmail)) &&
    timingSafeEqual(digest(password), digest(wantPassword));
  if (!ok) redirect('/login?error=1');

  cookies().set(SESSION_COOKIE, await createSession(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIES === 'true',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect('/admin');
}
