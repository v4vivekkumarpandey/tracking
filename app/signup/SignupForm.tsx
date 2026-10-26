'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signupAdvertiser, signupPublisher, type SignupState } from './actions';

export function SignupForm({ role }: { role: 'publisher' | 'advertiser' }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(
    role === 'publisher' ? signupPublisher : signupAdvertiser,
    null,
  );
  const isPub = role === 'publisher';
  return (
    <form action={action} className="card stack">
      <h1>{isPub ? 'Join as a publisher' : 'Advertise with us'}</h1>
      <p className="muted">
        {isPub
          ? 'Promote our offers and earn for every conversion. We review every application, usually within 1–2 business days.'
          : 'Reach our publishers and pay only for results. We review every application, usually within 1–2 business days.'}
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      <div className="grid2">
        <label>Your name<input name="name" required maxLength={200} autoComplete="name" /></label>
        <label>Company{isPub && ' (optional)'}<input name="company" required={!isPub} maxLength={200} autoComplete="organization" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Website{isPub ? ' (optional)' : ''}<input name="website" type="url" placeholder="https://" required={!isPub} /></label>
        <label>Password (min 10 characters)<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>Repeat password<input name="password2" type="password" required minLength={10} autoComplete="new-password" /></label>
        {isPub && <label>Country (2 letters)<input name="country" maxLength={2} placeholder="US" /></label>}
      </div>
      {isPub && (
        <label>
          How will you promote offers? (websites, social, email, paid ads…)
          <textarea name="traffic_sources" rows={3} required maxLength={2000} />
        </label>
      )}
      {/* Honeypot: hidden from people; bots fill it in. */}
      <input name="fax" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
      <p className="muted">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
