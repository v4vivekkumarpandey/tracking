import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { changePassword, updateAccount } from '../actions';
import { ActionForm } from '../../_components/ActionForm';

export default async function PublisherAccount() {
  const me = await requirePublisher();
  const [p] = await q<{
    name: string; company: string | null; website: string | null; country: string | null; tax_id: string | null;
    payout_method: string | null; payout_details: string | null;
  }>(`SELECT name, company, website, country, tax_id, payout_method, payout_details FROM publishers WHERE id = ?`, [me.publisherId]);

  return (
    <>
      <div className="crumb">Account</div>
      <h1>Settings</h1>
      <ActionForm action={updateAccount} submit="Save">
        <h2>Profile & payment details</h2>
        <div className="grid2">
          <label>Name<input name="name" defaultValue={p.name} required maxLength={200} /></label>
          <label>Company<input name="company" defaultValue={p.company ?? ''} maxLength={200} /></label>
          <label>Website<input name="website" type="url" defaultValue={p.website ?? ''} /></label>
          <label>Country (2 letters)<input name="country" defaultValue={p.country ?? ''} maxLength={2} /></label>
          <label>Tax / VAT ID<input name="tax_id" defaultValue={p.tax_id ?? ''} maxLength={64} /></label>
          <label>Payment method
            <select name="payout_method" defaultValue={p.payout_method ?? ''}>
              <option value="">Choose…</option>
              <option value="paypal">PayPal</option>
              <option value="wise">Wise</option>
              <option value="bank">Bank transfer</option>
              <option value="crypto">Crypto (USDT)</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <label>
          Payment details (PayPal email, Wise email, IBAN/SWIFT and account name, or wallet address and network)
          <textarea name="payout_details" rows={3} defaultValue={p.payout_details ?? ''} maxLength={1000} />
        </label>
      </ActionForm>

      <ActionForm action={changePassword} submit="Change password" reset>
        <h2>Password</h2>
        <p className="muted">Signed in as {me.email}</p>
        <div className="grid2">
          <label>Current password<input name="current" type="password" required autoComplete="current-password" /></label>
          <span />
          <label>New password (min 10)<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
          <label>Repeat new password<input name="password2" type="password" required minLength={10} autoComplete="new-password" /></label>
        </div>
      </ActionForm>
    </>
  );
}
