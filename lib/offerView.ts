import { money } from './format';

/** What a publisher earns on an offer: their override, else % of sale, else the fixed payout. */
export function payoutText(r: { default_payout: string; payout_percent: string | null; payout_override: string | null }) {
  if (r.payout_override) return money(r.payout_override);
  if (r.payout_percent) return `${Number(r.payout_percent)}% of sale`;
  return money(r.default_payout);
}
