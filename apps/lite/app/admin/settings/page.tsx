import { requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '../../_components/ActionForm';
import { saveSettingsAction } from '../actions';

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <div className="crumb">Settings</div>
      <h1>Settings</h1>
      <ActionForm action={saveSettingsAction} submit="Save settings">
        <h2>Your company (shown on invoices)</h2>
        <div className="grid2">
          <label>Company name<input name="company_name" defaultValue={s.company_name} maxLength={200} /></label>
          <label>Billing email<input name="company_email" type="email" defaultValue={s.company_email} maxLength={200} /></label>
          <label>Tax / VAT ID<input name="company_tax_id" defaultValue={s.company_tax_id} maxLength={64} /></label>
          <label>Invoice tax % (e.g. VAT; 0 = none)<input name="invoice_tax_percent" inputMode="decimal" defaultValue={s.invoice_tax_percent} /></label>
          <label>Invoice due in (days)<input name="invoice_due_days" type="number" min={0} max={365} defaultValue={s.invoice_due_days} /></label>
        </div>
        <label>Address<textarea name="company_address" rows={3} defaultValue={s.company_address} maxLength={1000} /></label>
        <label>Payment terms / instructions (printed on every invoice)<textarea name="invoice_payment_terms" rows={3} defaultValue={s.invoice_payment_terms} maxLength={2000} /></label>

        <h2>Publisher referrals</h2>
        <div className="grid2">
          <label>Referral commission (% of referred publishers&apos; approved earnings)<input name="referral_percent" inputMode="decimal" defaultValue={s.referral_percent} /></label>
          <label>For how many months after they join<input name="referral_months" type="number" min={1} max={120} defaultValue={s.referral_months} /></label>
        </div>
        <p className="muted">You pay referral commission on top; it is never deducted from the referred publisher. Set 0% to switch referrals off.</p>

        <h2>Conversions</h2>
        <label>Default auto-approve for new offers (days, empty = off)<input name="default_auto_approve_days" type="number" min={1} max={365} defaultValue={s.default_auto_approve_days} /></label>
      </ActionForm>
    </>
  );
}
