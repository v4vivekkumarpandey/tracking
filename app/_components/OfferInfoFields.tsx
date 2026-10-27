type Info = {
  description?: string | null; kpi?: string | null; preview_url?: string | null; category?: string | null;
  terms?: string | null; require_terms?: number;
};

/** Offer details shown to publishers: used on the new-offer and edit-offer forms. */
export function OfferInfoFields({ o = {} }: { o?: Info }) {
  return (
    <>
      <div className="grid2">
        <label>Category<input name="category" defaultValue={o.category ?? ''} maxLength={100} placeholder="Health, Finance, Nutra…" /></label>
        <label>Preview URL (the offer page publishers can look at)<input name="preview_url" type="url" defaultValue={o.preview_url ?? ''} placeholder="https://" /></label>
      </div>
      <label>Description (what the offer is, target audience)<textarea name="description" rows={4} defaultValue={o.description ?? ''} maxLength={5000} /></label>
      <label>KPI / traffic rules (e.g. min. quality, forbidden keywords, no incentives)<textarea name="kpi" rows={3} defaultValue={o.kpi ?? ''} maxLength={5000} /></label>
      <label>Terms and conditions<textarea name="terms" rows={3} defaultValue={o.terms ?? ''} maxLength={10000} /></label>
      <label className="check"><input type="checkbox" name="require_terms" defaultChecked={!!o.require_terms} /> Publishers must accept the terms before they get a link</label>
    </>
  );
}
