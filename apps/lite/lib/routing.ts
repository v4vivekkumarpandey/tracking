// Pure decisions for the click path (unit-tested): does an offer accept this
// visitor, and which offer should a smart link pick.

export type Rules = {
  countries: string | null;  // "US,CA,GB" or null = everywhere
  devices: string | null;    // "mobile,tablet" or null = all
  daily_cap: number | null;  // max conversions per UTC day
  monthly_cap: number | null;
  daily_budget: number | null; // max revenue per UTC day
};
export type Usage = { today: number; month: number; revenueToday: number };
export type Visitor = { country: string; device: string };
export type Block = 'geo' | 'device' | 'cap' | null;

const list = (s: string | null) => (s ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);

/** Why this visitor can't be sent to this offer right now, or null if they can. */
export function blockReason(r: Rules, v: Visitor, u: Usage): Block {
  const countries = list(r.countries);
  // An unknown country is only blocked when the offer is geo-targeted.
  if (countries.length && !countries.includes(v.country.toUpperCase())) return 'geo';
  const devices = list(r.devices);
  if (devices.length && !devices.includes(v.device.toUpperCase())) return 'device';
  if (r.daily_cap != null && u.today >= r.daily_cap) return 'cap';
  if (r.monthly_cap != null && u.month >= r.monthly_cap) return 'cap';
  if (r.daily_budget != null && u.revenueToday >= r.daily_budget) return 'cap';
  return null;
}

/**
 * Smart link choice among eligible offers: mostly weighted by earnings per
 * click, with `explore` share picked uniformly so new offers get traffic
 * and their EPC can be learned. `rand` is injectable for tests.
 */
export function pickOffer<T extends { epc: number }>(candidates: T[], rand: () => number = Math.random, explore = 0.1): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (rand() < explore) return candidates[Math.floor(rand() * candidates.length) % candidates.length];
  // A small floor keeps zero-EPC offers selectable in the weighted draw.
  const weights = candidates.map((c) => Math.max(c.epc, 0) + 0.001);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    x -= weights[i];
    if (x <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
