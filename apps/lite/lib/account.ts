import { startSession } from './auth';
import { exec, q } from './db';
import { MIN_PASSWORD, hashPassword, verifyPassword } from './password';

export type FormState = { ok?: string; error?: string } | null;

/**
 * Changes a user's password after checking the current one. Other sessions
 * are signed out (session_version bump); this browser gets a fresh session.
 */
export async function changePassword(userId: number, fd: FormData): Promise<FormState> {
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('password') ?? '');
  if (next.length < MIN_PASSWORD) return { error: `New password must be at least ${MIN_PASSWORD} characters.` };
  if (next !== String(fd.get('password2') ?? '')) return { error: 'The new passwords do not match.' };
  const [u] = await q<{ password_hash: string; session_version: number }>(
    `SELECT password_hash, session_version FROM users WHERE id = ?`, [userId],
  );
  if (!u || !(await verifyPassword(current, u.password_hash))) return { error: 'Current password is wrong.' };
  await exec(`UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?`, [await hashPassword(next), userId]);
  await startSession(`u:${userId}:${u.session_version + 1}`);
  return { ok: 'Password changed. Other devices have been signed out.' };
}
