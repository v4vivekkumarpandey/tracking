import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ActionForm } from '../../_components/ActionForm';
import { changePassword, updateAccount } from '../actions';

export default async function AdvertiserAccount() {
  const me = await requireAdvertiser();
  const [a] = await q<{ name: string; company: string | null; website: string | null; tax_id: string | null }>(
    `SELECT name, company, website, tax_id FROM advertisers WHERE id = ?`, [me.advertiserId],
  );
  return (
    <>
      <div className="crumb">Account</div>
      <h1>Settings</h1>
      <ActionForm action={updateAccount} submit="Save">
        <h2>Company</h2>
        <div className="grid2">
          <label>Contact name<input name="name" defaultValue={a.name} required maxLength={200} /></label>
          <label>Company<input name="company" defaultValue={a.company ?? ''} required maxLength={200} /></label>
          <label>Website<input name="website" type="url" defaultValue={a.website ?? ''} /></label>
          <label>Tax / VAT ID<input name="tax_id" defaultValue={a.tax_id ?? ''} maxLength={64} /></label>
        </div>
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
