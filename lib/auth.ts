import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { q } from './db';
import { ipFromHeaders } from './request';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSession, verifySession } from './session';

// Session subject: "admin" for the env admin, or "u:<userId>:<sessionVersion>"
// for advertiser/publisher users. Bumping users.session_version (password
// change, reset) logs every existing session of that user out.

export type Role = 'admin' | 'advertiser' | 'publisher';

async function subject(): Promise<string | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function startSession(sub: string) {
  (await cookies()).set(SESSION_COOKIE, await createSession(sub), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIES === 'true',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Call at the top of every admin page and every admin server action.
 * Middleware only redirects visitors without a cookie; this is the real check.
 */
export async function requireAdmin(): Promise<string> {
  if ((await subject()) !== 'admin') redirect('/login');
  return process.env.ADMIN_EMAIL ?? 'admin';
}

type UserRow = {
  id: number; email: string; role: string; session_version: number;
  advertiser_id: number | null; publisher_id: number | null; entity_status: string | null; entity_name: string | null;
};

async function loadUser(): Promise<UserRow | null> {
  const sub = await subject();
  const m = sub?.match(/^u:(\d+):(\d+)$/);
  if (!m) return null;
  const [u] = await q<UserRow>(
    `SELECT u.id, u.email, u.role, u.session_version, u.advertiser_id, u.publisher_id,
            COALESCE(p.status, a.status) AS entity_status, COALESCE(p.name, a.name) AS entity_name
     FROM users u
     LEFT JOIN publishers p  ON p.id = u.publisher_id AND u.role = 'publisher'
     LEFT JOIN advertisers a ON a.id = u.advertiser_id AND u.role = 'advertiser'
     WHERE u.id = ?`,
    [Number(m[1])],
  );
  if (!u || u.session_version !== Number(m[2])) return null;
  return u;
}

export type PublisherSession = { userId: number; email: string; publisherId: number; name: string };
export type AdvertiserSession = { userId: number; email: string; advertiserId: number; name: string };

/** Publisher pages and actions: scope every query by the returned publisherId. */
export async function requirePublisher(): Promise<PublisherSession> {
  const u = await loadUser();
  if (!u || u.role !== 'publisher' || !u.publisher_id || u.entity_status !== 'active') redirect('/login');
  return { userId: Number(u.id), email: u.email, publisherId: Number(u.publisher_id), name: u.entity_name ?? '' };
}

/** Advertiser pages and actions: scope every query by the returned advertiserId. */
export async function requireAdvertiser(): Promise<AdvertiserSession> {
  const u = await loadUser();
  if (!u || u.role !== 'advertiser' || !u.advertiser_id || u.entity_status !== 'active') redirect('/login');
  return { userId: Number(u.id), email: u.email, advertiserId: Number(u.advertiser_id), name: u.entity_name ?? '' };
}

export async function requestIp(): Promise<string> {
  return ipFromHeaders(await headers());
}
