type Info = {
  description: string | null; kpi?: string | null; preview_url?: string | null; category?: string | null;
  terms?: string | null; require_terms?: number;
};

/** Category, preview link, description, KPI rules and terms of an offer. */
export function OfferInfo({ o }: { o: Info }) {
  return (
    <>
      {(o.category || o.preview_url) && (
        <div className="row">
          {o.category && <span className="badge">{o.category}</span>}
          {o.preview_url && <a href={o.preview_url} target="_blank" rel="noreferrer noopener">Preview the offer page ↗</a>}
        </div>
      )}
      {o.description && <p className="wrap">{o.description}</p>}
      {o.kpi && (
        <div className="notice">
          <strong>KPI / traffic rules</strong>
          <p className="wrap">{o.kpi}</p>
        </div>
      )}
      {o.terms && (
        <details>
          <summary>Terms and conditions{o.require_terms ? ' (must be accepted)' : ''}</summary>
          <p className="wrap">{o.terms}</p>
        </details>
      )}
    </>
  );
}
