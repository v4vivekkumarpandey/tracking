'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import type { FormState } from '@/lib/account';
import { METHOD_TYPES } from '@/lib/paymentTypes';

/** Add-a-payment-method form: the fields change with the chosen method. */
export function AddPaymentMethod({ action, publisherId, needPassword }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>; publisherId?: number; needPassword: boolean;
}) {
  const [type, setType] = useState('paypal');
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  // Clear only after a successful save, so a typo doesn't wipe the whole form.
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setType('paypal'); } }, [state]);
  const def = METHOD_TYPES[type];
  return (
    <form ref={ref} className="card stack" onSubmit={(e) => {
      // Not action={run}: React resets action forms after every submit, which
      // would put the method dropdown back to PayPal while bank fields show.
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      startTransition(() => run(fd));
    }}>
      <h2>Add a payment method</h2>
      {publisherId && <input type="hidden" name="publisher_id" value={publisherId} />}
      <label>Method
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(METHOD_TYPES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </label>
      <div className="grid2">
        {def.fields.map((f) => (
          <label key={`${type}_${f.k}`}>
            {f.label}{f.required ? '' : ' (optional)'}
            {f.options ? (
              <select name={`${type}_${f.k}`} required={f.required} defaultValue="">
                <option value="" disabled>Choose…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.k === 'notes' ? (
              <textarea name={`${type}_${f.k}`} rows={3} maxLength={500} required={f.required} />
            ) : (
              <input name={`${type}_${f.k}`} required={f.required} maxLength={190} placeholder={f.hint}
                type={f.k === 'email' ? 'email' : 'text'} autoComplete="off" />
            )}
          </label>
        ))}
      </div>
      <label className="check"><input type="checkbox" name="make_default" /> Use this as my default payout method</label>
      {needPassword && (
        <label>Your password (required to change payment details)
          <input name="current" type="password" required autoComplete="current-password" />
        </label>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok-text">{state.ok}</p>}
      <div><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save payment method'}</button></div>
    </form>
  );
}
