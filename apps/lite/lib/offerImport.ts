// Columns of the offer import/export sheet. The same list drives the export,
// the template, the help table on the import page and the import itself.

export type ColKind = 'text' | 'multi' | 'bool';
export type ImportCol = {
  key: string;
  /** Offer form field it fills; null for columns handled separately (id, advertiser, visibility, status). */
  field: string | null;
  kind: ColKind;
  help: string;
  example: string;
};

export const IMPORT_COLUMNS: ImportCol[] = [
  { key: 'id', field: null, kind: 'text', help: 'Empty = create a new offer. An existing offer ID = update that offer.', example: '' },
  { key: 'name', field: 'name', kind: 'text', help: 'Offer name (required).', example: 'Brand – Product – US' },
  { key: 'advertiser', field: null, kind: 'text', help: 'Advertiser ID, email or exact name (required for new offers).', example: '' },
  { key: 'destination_url', field: 'destination_url', kind: 'text', help: 'Offer URL with {click_id} (required).', example: 'https://brand.example/?click_id={click_id}' },
  { key: 'payout_model', field: 'payout_model', kind: 'text', help: 'CPA, CPS, CPL or CPI (default CPA).', example: 'CPA' },
  { key: 'revenue', field: 'default_revenue', kind: 'text', help: 'What the advertiser pays you per conversion.', example: '40' },
  { key: 'payout', field: 'default_payout', kind: 'text', help: 'What the publisher earns per conversion.', example: '32' },
  { key: 'revenue_percent', field: 'revenue_percent', kind: 'text', help: 'Or revenue as % of the sale (type 10, not 10%).', example: '' },
  { key: 'payout_percent', field: 'payout_percent', kind: 'text', help: 'Or payout as % of the sale.', example: '' },
  { key: 'attribution_days', field: 'attribution_days', kind: 'text', help: '1–365 (default 30).', example: '30' },
  { key: 'auto_approve_days', field: 'auto_approve_days', kind: 'text', help: 'Approve pending conversions after N days (empty = Settings default).', example: '' },
  { key: 'countries', field: 'countries', kind: 'text', help: '2-letter codes, e.g. US,GB (empty = all).', example: 'US,CA' },
  { key: 'devices', field: 'devices', kind: 'multi', help: 'mobile, tablet, desktop (empty = all).', example: 'mobile' },
  { key: 'os', field: 'os_targets', kind: 'multi', help: 'android, ios, windows, mac (empty = all).', example: 'android,ios' },
  { key: 'daily_cap', field: 'daily_cap', kind: 'text', help: 'Max conversions per day.', example: '' },
  { key: 'monthly_cap', field: 'monthly_cap', kind: 'text', help: 'Max conversions per month.', example: '' },
  { key: 'daily_budget', field: 'daily_budget', kind: 'text', help: 'Max revenue per day.', example: '' },
  { key: 'fallback_url', field: 'fallback_url', kind: 'text', help: 'Where blocked or capped visitors go.', example: '' },
  { key: 'fallback_offer_id', field: 'fallback_offer_id', kind: 'text', help: 'Or another offer ID for them.', example: '' },
  { key: 'blocked_sources', field: 'blocked_sources', kind: 'multi', help: 'Forbidden traffic, e.g. google_ads,bing_ads.', example: '' },
  { key: 'category', field: 'category', kind: 'text', help: 'Shown to publishers.', example: 'Health' },
  { key: 'description', field: 'description', kind: 'text', help: 'Shown to publishers.', example: '' },
  { key: 'kpi', field: 'kpi', kind: 'text', help: 'KPI / traffic rules for publishers.', example: 'No brand bidding' },
  { key: 'preview_url', field: 'preview_url', kind: 'text', help: 'Landing page preview link.', example: '' },
  { key: 'terms', field: 'terms', kind: 'text', help: 'Terms publishers must accept.', example: '' },
  { key: 'require_terms', field: 'require_terms', kind: 'bool', help: 'yes / no: publishers must accept the terms.', example: 'no' },
  { key: 'deeplink_enabled', field: 'deeplink_enabled', kind: 'bool', help: 'yes / no: allow deep links.', example: 'no' },
  { key: 'deeplink_param', field: 'deeplink_param', kind: 'text', help: 'Deep-link parameter (default click_id).', example: '' },
  { key: 'visibility', field: null, kind: 'text', help: 'open (instant link), public (approval required) or private.', example: 'public' },
  { key: 'status', field: null, kind: 'text', help: 'active or paused (archived only for existing offers).', example: 'active' },
];

const ALIASES: Record<string, string> = {
  offer_id: 'id', offer_name: 'name', offer: 'name', url: 'destination_url', offer_url: 'destination_url',
  default_revenue: 'revenue', default_payout: 'payout', os_targets: 'os', advertiser_id: 'advertiser', advertiser_email: 'advertiser',
};

/** "Payout %" → "payout_percent"-style key; null if the column is unknown. */
export function columnKey(header: string): string | null {
  const k = header.trim().toLowerCase().replace(/%/g, 'percent').replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_]/g, '');
  const key = ALIASES[k] ?? k;
  return IMPORT_COLUMNS.some((c) => c.key === key) ? key : null;
}

export function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'on'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'off', ''].includes(s)) return false;
  return null;
}

const VIS: Record<string, string> = {
  open: 'open', instant: 'open', 'public, instant link': 'open',
  public: 'public', approval: 'public', 'public, approval required': 'public',
  private: 'private',
};
export const visibilityOf = (v: string): string | null => VIS[v.trim().toLowerCase()] ?? null;

export type OfferRow = Record<string, unknown> & { id: number; advertiser_id: number; advertiser_email: string | null };

/** One offer as sheet cells (export and round trip). */
export function exportCells(o: OfferRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of IMPORT_COLUMNS) {
    let v: unknown;
    if (c.key === 'id') v = o.id;
    else if (c.key === 'advertiser') v = o.advertiser_email || o.advertiser_id;
    else if (c.key === 'visibility' || c.key === 'status') v = o[c.key];
    else v = o[c.field!];
    if (c.kind === 'bool') out[c.key] = Number(v) ? 'yes' : 'no';
    else out[c.key] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}
