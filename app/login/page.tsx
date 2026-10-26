import Link from 'next/link';
import { login } from './actions';
import { Logo } from '../_components/Logo';

const MESSAGES: Record<string, string> = {
  '1': 'Wrong email or password.',
  limit: 'Too many attempts. Please wait 15 minutes and try again.',
  pending: 'Your account is waiting for approval. We will review it shortly.',
  blocked: 'This account is not active. Please contact support.',
};

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; signup?: string }> }) {
  const sp = await props.searchParams;
  return (
    <main className="login">
      <div className="auth-box">
        <div className="auth-brand"><Logo height={36} /><span>Affiliate platform</span></div>
        <form action={login} className="card stack">
          <h1>Sign in</h1>
          {sp.signup && <p className="notice">Thanks for signing up! Your account is pending approval. You can sign in once it&apos;s approved.</p>}
          {sp.error && <p className="error">{MESSAGES[sp.error] ?? MESSAGES['1']}</p>}
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <p className="auth-links">
          New here? <Link href="/signup/publisher">Join as a publisher</Link> · <Link href="/signup/advertiser">Advertise with us</Link>
        </p>
      </div>
    </main>
  );
}
