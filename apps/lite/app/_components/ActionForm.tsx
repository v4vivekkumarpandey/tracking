'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/lib/account';

/** A card form that shows the action's ok/error message inline. */
export function ActionForm({ action, submit, reset, children }: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submit: string;
  /** Clear the fields after success (e.g. password forms). */
  reset?: boolean;
  children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (reset && state?.ok) ref.current?.reset();
  }, [state, reset]);
  return (
    <form ref={ref} action={run} className="card stack">
      {children}
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok-text">{state.ok}</p>}
      <div><button type="submit" disabled={pending}>{pending ? 'Saving…' : submit}</button></div>
    </form>
  );
}
