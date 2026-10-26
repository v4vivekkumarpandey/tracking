import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { CURRENCY } from '@/lib/format';
import { ActionForm } from '../../../_components/ActionForm';
import { submitOffer } from '../../actions';

export default async function NewOffer() {
  await requireAdvertiser();
  return (
    <>
      <div className="crumb"><Link href="/advertiser/offers">Offers</Link></div>
      <h1>Submit a new offer</h1>
      <ActionForm action={submitOffer} submit="Submit for review">
        <p className="muted">We review new offers (usually within 1–2 business days), then publish them to our publishers.</p>
        <label>Offer name<input name="name" required maxLength={200} placeholder="Brand – Product – Country" /></label>
        <label>
          <span>Landing page URL. Must include <code>{'{click_id}'}</code>, which you store and send back when a conversion happens.</span>
          <input name="destination_url" type="url" required placeholder="https://yoursite.com/landing?click_id={click_id}" />
        </label>
        <div className="grid2">
          <label>Payout model
            <select name="payout_model" defaultValue="CPA">
              <option value="CPA">CPA – per action</option>
              <option value="CPS">CPS – per sale</option>
              <option value="CPL">CPL – per lead</option>
              <option value="CPI">CPI – per install</option>
            </select>
          </label>
          <label>Attribution window (days)<input name="attribution_days" type="number" min={1} max={365} defaultValue={30} /></label>
          <label>You pay
            <select name="pricing" defaultValue="fixed">
              <option value="fixed">Fixed amount per conversion ({CURRENCY})</option>
              <option value="percent">Percentage of sale amount</option>
            </select>
          </label>
          <label>Amount<input name="amount" inputMode="decimal" required placeholder="e.g. 25 or 10" /></label>
        </div>
        <label>Description for publishers (allowed traffic, restrictions, target countries)<textarea name="description" rows={5} maxLength={5000} /></label>
      </ActionForm>
    </>
  );
}
