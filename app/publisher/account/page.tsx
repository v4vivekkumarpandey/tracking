import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { methodsOf } from '@/lib/paymentMethods';
import type { Profile } from '@/lib/profile';
import { addPaymentMethod, changePassword, removePaymentMethod, setDefaultPaymentMethod, updateAccount } from '../actions';
import { ActionForm } from '../../_components/ActionForm';
import { PaymentMethods } from '../../_components/PaymentMethods';
import { ProfileFields } from '../../_components/ProfileFields';

export default async function PublisherAccount() {
  const me = await requirePublisher();
  const [[p], methods] = await Promise.all([
    q<Profile>(
      `SELECT name, company, email, website, country, tax_id, phone, messenger, address, traffic_sources FROM publishers WHERE id = ?`,
      [me.publisherId],
    ),
    methodsOf(me.publisherId),
  ]);

  return (
    <>
      <div className="crumb">Account</div>
      <h1>Settings</h1>
      <ActionForm action={updateAccount} submit="Save profile">
        <h2>Profile</h2>
        <ProfileFields p={p} />
        <p className="muted">Your sign-in email is {me.email}. To change it, contact us.</p>
      </ActionForm>

      <PaymentMethods methods={methods} add={addPaymentMethod} setDefault={setDefaultPaymentMethod} remove={removePaymentMethod} />

      <ActionForm action={changePassword} submit="Change password" reset>
        <h2>Password</h2>
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
