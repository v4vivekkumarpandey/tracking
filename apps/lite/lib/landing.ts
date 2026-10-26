import { exec, q } from './db';
import { clearLinkCache } from './links';

// Extra landing pages per offer. Publishers can pick one (?lp=id on their
// link); visitors without a choice are split by each page's %, and the rest
// go to the offer's default landing page URL.

export type LandingRow = { id: number; offer_id: number; name: string; url: string; weight: number; status: string; clicks: number };

export function landingPagesFor(offerId: number, withArchived = false): Promise<LandingRow[]> {
  return q<LandingRow>(
    `SELECT lp.id, lp.offer_id, lp.name, lp.url, lp.weight, lp.status,
            (SELECT COUNT(*) FROM clicks c WHERE c.offer_id = lp.offer_id AND c.lp_id = lp.id AND c.ts >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS clicks
     FROM offer_landing_pages lp WHERE lp.offer_id = ?${withArchived ? '' : ` AND lp.status = 'active'`} ORDER BY lp.status, lp.id`,
    [offerId],
  );
}

function checkUrl(url: string, offerDestination: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'URL must start with http:// or https://';
  } catch {
    return 'Enter a full URL starting with https://';
  }
  // Keep the click ID flowing: if the offer's own URL passes it, every page must.
  if (offerDestination.includes('{click_id}') && !url.includes('{click_id}')) {
    return 'The URL must contain {click_id} (like the offer\'s landing page) so conversions can be reported.';
  }
  return null;
}

function parseWeight(v: string): number | null {
  if (v === '') return 0;
  return /^\d{1,3}$/.test(v) && Number(v) <= 100 ? Number(v) : null;
}

async function otherWeights(offerId: number, exceptId: number | null): Promise<number> {
  const [r] = await q<{ total: string | null }>(
    `SELECT SUM(weight) AS total FROM offer_landing_pages WHERE offer_id = ? AND status = 'active' AND id <> ?`,
    [offerId, exceptId ?? 0],
  );
  return Number(r?.total ?? 0);
}

/** Returns an error message, or null when saved. */
export async function addLandingPage(offerId: number, fd: FormData, by: string): Promise<string | null> {
  const name = String(fd.get('name') ?? '').trim().slice(0, 200);
  const url = String(fd.get('url') ?? '').trim().slice(0, 2000);
  const weight = parseWeight(String(fd.get('weight') ?? '').trim());
  if (!name) return 'Give the page a name (e.g. "Quiz funnel").';
  if (weight === null) return 'Split % must be a whole number from 0 to 100.';
  const [o] = await q<{ destination_url: string }>(`SELECT destination_url FROM offers WHERE id = ?`, [offerId]);
  if (!o) return 'Offer not found.';
  const bad = checkUrl(url, o.destination_url);
  if (bad) return bad;
  if (weight + (await otherWeights(offerId, null)) > 100) return 'Split % across all pages can be at most 100.';
  await exec(
    `INSERT INTO offer_landing_pages (offer_id, name, url, weight, created_by) VALUES (?, ?, ?, ?, ?)`,
    [offerId, name, url, weight, by],
  );
  clearLinkCache();
  return null;
}

export async function setLandingWeight(id: number, offerId: number, raw: string): Promise<string | null> {
  const weight = parseWeight(raw.trim());
  if (weight === null) return 'Split % must be a whole number from 0 to 100.';
  if (weight + (await otherWeights(offerId, id)) > 100) return 'Split % across all pages can be at most 100.';
  await exec(`UPDATE offer_landing_pages SET weight = ? WHERE id = ? AND offer_id = ?`, [weight, id, offerId]);
  clearLinkCache();
  return null;
}

/** The "Update a page" form: new split % and active/archived. */
export async function updateLandingPage(offerId: number, fd: FormData): Promise<string | null> {
  const id = Number(fd.get('lp_id'));
  const status = String(fd.get('status') ?? 'active');
  if (!Number.isInteger(id) || id <= 0) return 'Choose a page.';
  if (status !== 'active' && status !== 'archived') return 'Invalid status.';
  const [p] = await q<{ id: number }>(`SELECT id FROM offer_landing_pages WHERE id = ? AND offer_id = ?`, [id, offerId]);
  if (!p) return 'Page not found.';
  // Archive first (frees its %), activate last (checks the total).
  if (status === 'archived') return (await setLandingStatus(id, offerId, 'archived')) ?? setLandingWeight(id, offerId, String(fd.get('weight') ?? ''));
  return (await setLandingWeight(id, offerId, String(fd.get('weight') ?? ''))) ?? setLandingStatus(id, offerId, 'active');
}

/** Archived pages stop serving; clicks that chose them get the normal split. */
export async function setLandingStatus(id: number, offerId: number, status: 'active' | 'archived'): Promise<string | null> {
  if (status === 'active') {
    const [p] = await q<{ weight: number }>(`SELECT weight FROM offer_landing_pages WHERE id = ? AND offer_id = ?`, [id, offerId]);
    if (p && Number(p.weight) + (await otherWeights(offerId, id)) > 100) return 'Lower another page\'s split % first.';
  }
  await exec(`UPDATE offer_landing_pages SET status = ? WHERE id = ? AND offer_id = ?`, [status, id, offerId]);
  clearLinkCache();
  return null;
}
