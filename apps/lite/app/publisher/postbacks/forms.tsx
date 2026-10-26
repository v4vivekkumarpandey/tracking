'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/account';
import { addPostback, testPostback, type TestState } from '../actions';

export function AddPostback({ offers }: { offers: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPostback, null);
  return (
    <form action={action} className="row" style={{ marginTop: 8 }}>
      <label style={{ flex: 1, minWidth: 260 }}>Postback URL<input name="url" required type="url" placeholder="https://" /></label>
      <label>Offer
        <select name="offer_id" defaultValue="">
          <option value="">All offers</option>
          {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label>Event code<input name="goal" placeholder="all" style={{ width: 110 }} /></label>
      <button type="submit" disabled={pending}>Add postback</button>
      {state?.error && <p className="error" style={{ width: '100%' }}>{state.error}</p>}
      {state?.ok && <p className="ok-text" style={{ width: '100%' }}>{state.ok}</p>}
    </form>
  );
}

export function TestPostback({ id }: { id: number }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testPostback, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button className="secondary small" disabled={pending}>{pending ? 'Sending…' : 'Send test'}</button>
      {state && (
        <div className={state.error ? 'error' : 'ok-text'} style={{ fontSize: 12, marginTop: 4 }}>
          {state.error ? `Failed: ${state.error}` : `OK · HTTP ${state.status}`}
        </div>
      )}
    </form>
  );
}
