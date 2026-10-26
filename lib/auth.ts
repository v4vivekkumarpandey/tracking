import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from './session';

/**
 * Call at the top of every admin page and every server action. Middleware
 * only redirects visitors without a cookie; this is the real check.
 */
export async function requireAdmin(): Promise<string> {
  const email = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) redirect('/login');
  return email;
}
