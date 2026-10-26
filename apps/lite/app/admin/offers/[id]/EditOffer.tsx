import { ActionForm } from '../../../_components/ActionForm';
import { CURRENCY } from '@/lib/format';
import { RESTRICTABLE, sourceLabel } from '@/lib/sourceLabels';
import { updateOffer } from '../../actions';

export type EditableOffer = {
  id: number; name: string; destination_url: string; description: string | null; payout_model: string;
  attribution_days: number; default_revenue: string; default_payout: string; revenue_percent: string | null;
  payout_percent: string | null; deeplink_enabled: number; deeplink_param: string; auto_approve_days: number | null;
  countries: string | null; devices: string | null; daily_cap: number | null; monthly_cap: number | null;
  daily_budget: string | null; fallback_offer_id: number | null; fallback_url: string | null;
  blocked_sources: string | null;
};

const num = (v: string | number | null) => (v === null || v === undefined ? '' : String(Number(v)));

/** Collapsible edit form; saving records every change in the offer's history. */
export function EditOffer({ o, otherOffers }: { o: EditableOffer; otherOffers: { id: number; name: string }[] }) {
  const devices = (o.devices ?? '').split(',');
  const blocked = (o.blocked_sources ?? '').split(',');
  return (
    <details className="card edit-offer">
      <summary><strong>Edit offer</strong> <span className="muted">price, payout, landing page, targeting, caps, traffic sources, deep links, auto-approve</span></summary>
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

        <h3>Pricing</h3>
        <div className="grid2">
          <label>Revenue per conversion ({CURRENCY})<input name="default_revenue" inputMode="decimal" defaultValue={num(o.default_revenue)} /></label>
          <label>Payout per conversion ({CURRENCY})<input name="default_payout" inputMode="decimal" defaultValue={num(o.default_payout)} /></label>
          <label>or Revenue % of sale<input name="revenue_percent" inputMode="decimal" defaultValue={num(o.revenue_percent)} /></label>
          <label>or Payout % of sale<input name="payout_percent" inputMode="decimal" defaultValue={num(o.payout_percent)} /></label>
          <label>Attribution window (days)<input name="attribution_days" type="number" min={1} max={365} defaultValue={o.attribution_days} /></label>
          <label>Auto-approve after (days, empty = off)<input name="auto_approve_days" type="number" min={1} max={365} defaultValue={o.auto_approve_days ?? ''} /></label>
        </div>

        <h3>Targeting &amp; caps</h3>
        <p className="muted">Visitors outside the targeting, or after a cap is reached, go to the fallback offer (if the publisher is approved on it), else the fallback URL.</p>
        <div className="grid2">
          <label>Countries (2-letter codes, empty = all)<input name="countries" defaultValue={o.countries ?? ''} placeholder="US, CA, GB" /></label>
          <fieldset className="checks">
            <legend>Devices (none ticked = all)</legend>
            {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
              <label key={d} className="check"><input type="checkbox" name="devices" value={d} defaultChecked={devices.includes(d)} /> {d}</label>
            ))}
          </fieldset>
          <label>Daily conversion cap<input name="daily_cap" type="number" min={0} defaultValue={o.daily_cap ?? ''} /></label>
          <label>Monthly conversion cap<input name="monthly_cap" type="number" min={0} defaultValue={o.monthly_cap ?? ''} /></label>
          <label>Daily budget ({CURRENCY} revenue)<input name="daily_budget" inputMode="decimal" defaultValue={num(o.daily_budget)} /></label>
          <label>Fallback offer
            <select name="fallback_offer_id" defaultValue={o.fallback_offer_id ?? ''}>
              <option value="">None</option>
              {otherOffers.map((x) => <option key={x.id} value={x.id}>#{x.id} {x.name}</option>)}
            </select>
          </label>
        </div>
        <label>Fallback URL (used when there&apos;s no fallback offer)<input name="fallback_url" type="url" defaultValue={o.fallback_url ?? ''} placeholder="https://" /></label>

        <h3>Traffic sources</h3>
        <fieldset className="checks">
          <legend>Disallowed traffic sources (clicks still redirect; conversions are held for review)</legend>
          {RESTRICTABLE.map((s) => (
            <label key={s} className="check"><input type="checkbox" name="blocked_sources" value={s} defaultChecked={blocked.includes(s)} /> {sourceLabel(s)}</label>
          ))}
        </fieldset>

        <h3>Deep links</h3>
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
