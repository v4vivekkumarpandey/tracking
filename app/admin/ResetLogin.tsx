'use client';

import { useActionState } from 'react';
import { resetLogin, type ResetState } from './actions';

/** Creates or resets an advertiser/publisher login and shows the new password once. */
export function ResetLogin({ role, id, hasLogin }: { role: 'publisher' | 'advertiser'; id: number; hasLogin: boolean }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetLogin, null);
  return (
    <form action={action} className="inline reset-login">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="id" value={id} />
      <button className="secondary small" disabled={pending}
        onClick={(e) => { if (hasLogin && !confirm('Set a new password? Their current sessions will be signed out.')) e.preventDefault(); }}>
        {hasLogin ? 'Reset password' : 'Create login'}
      </button>
      {state?.error && <span className="error"> {state.error}</span>}
      {state?.password && (
        <span className="notice">
          Login <strong>{state.email}</strong> · temporary password <code>{state.password}</code>. Copy it now; it won&apos;t be shown again.
        </span>
      )}
    </form>
  );
}
