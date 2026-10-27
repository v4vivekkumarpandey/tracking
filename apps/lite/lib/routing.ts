// Pure decisions for the click path (unit-tested): does an offer accept this
// visitor, and which offer should a smart link pick.

export type Rules = {
  countries: string | null;  // "US,CA,GB" or null = everywhere
  devices: string | null;    // "mobile,tablet" or null = all
  os?: string | null;        // "android,ios" or null = all
  daily_cap: number | null;  // max conversions per UTC day
  monthly_cap: number | null;
  daily_budget: number | null; // max revenue per UTC day
};
export type Usage = { today: number; month: number; revenueToday: number };
export type Visitor = { country: string; device: string; os?: string };
/** ip = on the admin blocklist, dc = data-center traffic while set to block. */
export type Block = 'geo' | 'device' | 'os' | 'cap' | 'ip' | 'dc' | null;
export type LandingPage = { id: number; name: string; url: string; weight: number };

const list = (s: string | null) => (s ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);

/** Why this visitor can't be sent to this offer right now, or null if they can. */
export function blockReason(r: Rules, v: Visitor, u: Usage): Block {
  const countries = list(r.countries);
  // An unknown country is only blocked when the offer is geo-targeted.
  if (countries.length && !countries.includes(v.country.toUpperCase())) return 'geo';
  const devices = list(r.devices);
  if (devices.length && !devices.includes(v.device.toUpperCase())) return 'device';
  const oses = list(r.os ?? null);
  if (oses.length && !oses.includes((v.os ?? '').toUpperCase())) return 'os';
  if (r.daily_cap != null && u.today >= r.daily_cap) return 'cap';
  if (r.monthly_cap != null && u.month >= r.monthly_cap) return 'cap';
  if (r.daily_budget != null && u.revenueToday >= r.daily_budget) return 'cap';
  return null;
}

/**
 * Landing page for a click: the one the publisher chose (?lp=id) if it is an
 * active page of this offer; otherwise a draw by split % (weights are
 * percentages, total ≤ 100); the remainder gets the offer's default URL (null).
 */
export function pickLanding(pages: LandingPage[], requested: number | null, rand: () => number = Math.random): LandingPage | null {
  if (requested) {
    const p = pages.find((x) => x.id === requested);
    if (p) return p;
  }
  let x = rand() * 100;
  for (const p of pages) {
    if (p.weight <= 0) continue;
    x -= p.weight;
    if (x < 0) return p;
  }
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
