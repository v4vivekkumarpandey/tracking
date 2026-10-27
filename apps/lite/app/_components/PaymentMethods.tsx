import type { FormState } from '@/lib/account';
import { dateTime } from '@/lib/format';
import { describe, methodLabel, type PaymentMethod } from '@/lib/paymentMethods';
import { ActionForm } from './ActionForm';
import { AddPaymentMethod } from './AddPaymentMethod';

const RECENT_MS = 7 * 86_400_000;

/**
 * Saved payout methods with add / remove / default. For publishers, adding or
 * switching needs their password; the admin view flags methods added recently.
 */
export function PaymentMethods({ methods, add, setDefault, remove, publisherId, admin = false }: {
  methods: PaymentMethod[];
  add: (s: FormState, fd: FormData) => Promise<FormState>;
  setDefault: (s: FormState, fd: FormData) => Promise<FormState>;
  remove: (fd: FormData) => Promise<void>;
  publisherId?: number;
  admin?: boolean;
}) {
  return (
    <>
      <section className="card table-wrap">
        <h2>Payment methods</h2>
        <table>
          <thead><tr><th>Method</th><th>Details</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {methods.map((m) => {
              const recent = Date.now() - new Date(m.created_at).getTime() < RECENT_MS;
              return (
                <tr key={m.id}>
                  <td><strong>{methodLabel(m.type)}</strong>{Number(m.is_default) ? <> <span className="badge active">default</span></> : null}</td>
                  <td className="mono wrap">{describe(m.type, m.details)}</td>
                  <td>{dateTime(m.created_at)}{admin && recent && <div className="error">new: check before paying</div>}</td>
                  <td>
                    <form action={remove} className="inline">
                      <input type="hidden" name="id" value={m.id} />
                      {publisherId && <input type="hidden" name="publisher_id" value={publisherId} />}
                      <button className="danger small">Remove</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {methods.length === 0 && <tr><td colSpan={4} className="muted">No payment method yet{admin ? '.' : ': add one below so we can pay you.'}</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="grid2">
        <AddPaymentMethod action={add} publisherId={publisherId} needPassword={!admin} />
        {methods.length > 1 && (
          <ActionForm action={setDefault} submit="Change default">
            <h2>Default payout method</h2>
            {publisherId && <input type="hidden" name="publisher_id" value={publisherId} />}
            <label>Pay me with
              <select name="method_id" defaultValue={methods.find((m) => Number(m.is_default))?.id}>
                {methods.map((m) => <option key={m.id} value={m.id}>{methodLabel(m.type)} · {describe(m.type, m.details).slice(0, 40)}</option>)}
              </select>
            </label>
            {!admin && <label>Your password<input name="current" type="password" required autoComplete="current-password" /></label>}
          </ActionForm>
        )}
      </div>
    </>
  );
}
