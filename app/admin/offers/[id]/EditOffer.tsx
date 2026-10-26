import { ActionForm } from '../../../_components/ActionForm';
import { CURRENCY } from '@/lib/format';
import { updateOffer } from '../../actions';

export type EditableOffer = {
  id: number; name: string; destination_url: string; description: string | null; payout_model: string;
  attribution_days: number; default_revenue: string; default_payout: string; revenue_percent: string | null;
  payout_percent: string | null; deeplink_enabled: number; deeplink_param: string; auto_approve_days: number | null;
};

const num = (v: string | null) => (v === null || v === undefined ? '' : String(Number(v)));

/** Collapsible edit form; saving records every change in the offer's history. */
export function EditOffer({ o }: { o: EditableOffer }) {
  return (
    <details className="card edit-offer">
      <summary><strong>Edit offer</strong> <span className="muted">price, payout, landing page, deep links, auto-approve</span></summary>
      <ActionForm action={updateOffer} submit="Save changes">
        <input type="hidden" name="id" value={o.id} />
        <div className="grid2">
          <label>Offer name<input name="name" defaultValue={o.name} required maxLength={200} /></label>
          <label>Payout model
            <select name="payout_model" defaultValue={o.payout_model}>
              <option value="CPA">CPA – per action</option><option value="CPS">CPS – per sale</option>
              <option value="CPL">CPL – per lead</option><option value="CPI">CPI – per install</option>
            </select>
          </label>
        </div>
        <label><span>Landing page URL (macros: <code>{'{click_id} {pub_id} {sub1}…{sub5}'}</code>)</span>
          <input name="destination_url" type="url" defaultValue={o.destination_url} required />
        </label>
        <div className="grid2">
          <label>Revenue per conversion ({CURRENCY})<input name="default_revenue" inputMode="decimal" defaultValue={num(o.default_revenue)} /></label>
          <label>Payout per conversion ({CURRENCY})<input name="default_payout" inputMode="decimal" defaultValue={num(o.default_payout)} /></label>
          <label>or Revenue % of sale<input name="revenue_percent" inputMode="decimal" defaultValue={num(o.revenue_percent)} /></label>
          <label>or Payout % of sale<input name="payout_percent" inputMode="decimal" defaultValue={num(o.payout_percent)} /></label>
          <label>Attribution window (days)<input name="attribution_days" type="number" min={1} max={365} defaultValue={o.attribution_days} /></label>
          <label>Auto-approve after (days, empty = off)<input name="auto_approve_days" type="number" min={1} max={365} defaultValue={o.auto_approve_days ?? ''} /></label>
        </div>
        <div className="grid2">
          <label className="check"><input type="checkbox" name="deeplink_enabled" defaultChecked={!!o.deeplink_enabled} /> Allow deep links (publishers may link to any page on the landing domain)</label>
          <label>Deep-link click ID parameter<input name="deeplink_param" defaultValue={o.deeplink_param} maxLength={32} /></label>
        </div>
        <label>Description<textarea name="description" rows={4} defaultValue={o.description ?? ''} maxLength={5000} /></label>
        <p className="muted">Price changes apply to new conversions only; existing conversions keep the price they were recorded with.</p>
      </ActionForm>
    </details>
  );
}
