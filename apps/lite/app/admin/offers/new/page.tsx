import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { CURRENCY } from '@/lib/format';
import { VISIBILITY } from '@/lib/offerInfo';
import { createOffer } from '../../actions';
import { OfferInfoFields } from '../../../_components/OfferInfoFields';

export default async function NewOffer() {
  await requireAdmin();
  const advertisers = await q<{ id: number; name: string }>(
    `SELECT id, name FROM advertisers WHERE status <> 'paused' ORDER BY name`,
  );

  return (
    <>
      <div className="crumb"><Link href="/admin/offers">Offers</Link></div>
      <h1>New offer</h1>

      {advertisers.length === 0 ? (
        <div className="card">
          Add an advertiser first. <Link href="/admin/advertisers">Go to Advertisers</Link>.
        </div>
      ) : (
        <form action={createOffer} className="card stack">
          <h2>Basics</h2>
          <div className="grid2">
            <label>Offer name<input name="name" required maxLength={200} placeholder="Brand – Product – Country" /></label>
            <label>Advertiser
              <select name="advertiser_id" required>
                {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>Payout model
              <select name="payout_model" defaultValue="CPA">
                <option value="CPA">CPA – per action</option>
                <option value="CPS">CPS – per sale</option>
                <option value="CPL">CPL – per lead</option>
                <option value="CPI">CPI – per install</option>
              </select>
            </label>
            <label>Attribution window (days)<input name="attribution_days" type="number" min={1} max={365} defaultValue={30} /></label>
          </div>
          <label>
            <span>Destination URL. Macros: <code>{'{click_id} {pub_id} {offer_id} {source_id} {sub1}…{sub10}'}</code>. Must include <code>{'{click_id}'}</code> so the advertiser can report conversions.</span>
            <input name="destination_url" type="url" required placeholder="https://brand.example/?utm_source=network&click_id={click_id}" />
          </label>

          <h2>Pricing</h2>
          <p className="muted">
            Revenue is what the advertiser pays you; payout is what the publisher earns. Use a fixed amount <em>or</em> a % of the
            sale amount (for CPS). The difference is your margin.
          </p>
          <div className="grid2">
            <label>Revenue per conversion ({CURRENCY})<input name="default_revenue" inputMode="decimal" placeholder="e.g. 40" /></label>
            <label>Payout per conversion ({CURRENCY})<input name="default_payout" inputMode="decimal" placeholder="e.g. 32" /></label>
            <label>or Revenue % of sale<input name="revenue_percent" inputMode="decimal" placeholder="e.g. 10" /></label>
            <label>or Payout % of sale<input name="payout_percent" inputMode="decimal" placeholder="e.g. 7" /></label>
          </div>

          <h2>For publishers</h2>
          <OfferInfoFields />
          <label>Visibility
            <select name="visibility" defaultValue="public">
              {Object.entries(VISIBILITY).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>

          <div className="row">
            <button type="submit">Create offer</button>
            <Link href="/admin/offers">Cancel</Link>
          </div>
        </form>
      )}
    </>
  );
}
