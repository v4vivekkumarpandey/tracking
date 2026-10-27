import { recordPayment } from './actions';

const METHODS = ['paypal', 'bank', 'upi', 'payoneer', 'wise', 'crypto', 'other'] as const;

/** Inline form to record a payment already sent to a publisher. */
export function RecordPayment({ publisherId, amount, method }: { publisherId: number; amount: number; method: string | null }) {
  const m = METHODS.find((x) => x === method) ?? 'paypal';
  return (
    <form action={recordPayment} className="row record-payment">
      <input type="hidden" name="publisher_id" value={publisherId} />
      <input name="amount" inputMode="decimal" defaultValue={amount > 0 ? amount.toFixed(2) : ''} required aria-label="Amount" style={{ width: 90 }} />
      <select name="method" defaultValue={m} aria-label="Method">
        {METHODS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <input name="reference" placeholder="Transaction ref" aria-label="Reference" style={{ width: 130 }} />
      <button className="small" type="submit">Record</button>
    </form>
  );
}
