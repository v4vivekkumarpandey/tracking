import { CfError, cfConfigured, createHostname, deleteHostname, getHostname } from './cloudflare';
import { exec, isDuplicate, q } from './db';
import { trackingBase } from './format';
import { normalizeHostname } from './hostname';

// Custom tracking domains. A publisher or advertiser adds track.theirsite.com,
// points a CNAME at CNAME_TARGET, and Cloudflare for SaaS issues SSL. Traffic
// then reaches us through the Cloudflare Worker (see deploy/cloudflare/).

export type Owner = { type: 'publisher' | 'advertiser'; id: number };
export type DomainRow = {
  id: number; hostname: string; owner_type: string; owner_id: number; cf_id: string | null;
  status: string; last_error: string | null; checked_at: Date | null; activated_at: Date | null; created_at: Date;
};

export const MAX_DOMAINS = 5;
export const cnameTarget = () => process.env.CNAME_TARGET ?? 'domains.ossaward.org';
const primaryHost = () => new URL(trackingBase()).hostname;
const NOT_ENABLED = "Custom domains aren't enabled yet. We'll activate yours as soon as they are.";

export async function domainsFor(owner: Owner): Promise<DomainRow[]> {
  return q<DomainRow>(
    `SELECT * FROM tracking_domains WHERE owner_type = ? AND owner_id = ? ORDER BY id`,
    [owner.type, owner.id],
  );
}

/** The domain row with this id if it belongs to the owner, else null. */
export async function ownedDomain(id: number, owner: Owner): Promise<DomainRow | null> {
  const [d] = await q<DomainRow>(
    `SELECT * FROM tracking_domains WHERE id = ? AND owner_type = ? AND owner_id = ?`,
    [id, owner.type, owner.id],
  );
  return d ?? null;
}

export async function addDomain(owner: Owner, input: string): Promise<{ ok?: string; error?: string }> {
  let hostname: string;
  try {
    // Check against both our app's host and the CNAME target, in case they
    // sit on different domains.
    hostname = normalizeHostname(input, primaryHost());
    normalizeHostname(hostname, cnameTarget());
  } catch (e) {
    return { error: (e as Error).message };
  }
  const [{ n }] = await q<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tracking_domains WHERE owner_type = ? AND owner_id = ?`, [owner.type, owner.id],
  );
  if (Number(n) >= MAX_DOMAINS) return { error: `You can add up to ${MAX_DOMAINS} domains.` };
  let id: number;
  try {
    id = (await exec(
      `INSERT INTO tracking_domains (hostname, owner_type, owner_id) VALUES (?, ?, ?)`,
      [hostname, owner.type, owner.id],
    )).insertId;
  } catch (e) {
    if (isDuplicate(e)) return { error: `${hostname} is already registered.` };
    throw e;
  }
  const [row] = await q<DomainRow>(`SELECT * FROM tracking_domains WHERE id = ?`, [id]);
  await refreshDomain(row);
  return { ok: `${hostname} added. Now create the CNAME record shown below.` };
}

/**
 * Registers the hostname with Cloudflare if needed and syncs its status.
 * Active means Cloudflare sees our CNAME and has issued SSL.
 */
export async function refreshDomain(d: DomainRow): Promise<void> {
  if (d.status === 'disabled') return;
  if (!cfConfigured()) {
    await exec(`UPDATE tracking_domains SET last_error = ?, checked_at = NOW(3) WHERE id = ?`, [NOT_ENABLED, d.id]);
    return;
  }
  try {
    let h = d.cf_id ? await getHostname(d.cf_id).catch((e) => {
      if (e instanceof CfError && e.status === 404) return null; // deleted at Cloudflare: register again
      throw e;
    }) : null;
    if (!h) {
      h = await createHostname(d.hostname);
      await exec(`UPDATE tracking_domains SET cf_id = ? WHERE id = ?`, [h.id, d.id]);
    }
    const sslStatus = h.ssl?.status ?? 'unknown';
    if (h.status === 'active' && sslStatus === 'active') {
      await exec(
        `UPDATE tracking_domains SET status = 'active', last_error = NULL, checked_at = NOW(3),
                activated_at = COALESCE(activated_at, NOW(3)) WHERE id = ?`, [d.id],
      );
      clearDomainCache();
      return;
    }
    const why =
      h.verification_errors?.[0] ?? h.ssl?.validation_errors?.[0]?.message ??
      (h.status !== 'active' ? `Waiting for the CNAME record (${h.status})` : `Issuing SSL certificate (${sslStatus})`);
    await exec(
      `UPDATE tracking_domains SET status = 'pending', last_error = ?, checked_at = NOW(3) WHERE id = ?`,
      [why.slice(0, 255), d.id],
    );
  } catch (e) {
    await exec(
      `UPDATE tracking_domains SET last_error = ?, checked_at = NOW(3) WHERE id = ?`,
      [`Cloudflare: ${(e as Error).message}`.slice(0, 255), d.id],
    );
  }
  clearDomainCache();
}

export async function removeDomain(d: DomainRow): Promise<void> {
  if (d.cf_id && cfConfigured()) await deleteHostname(d.cf_id);
  await exec(`DELETE FROM tracking_domains WHERE id = ?`, [d.id]);
  clearDomainCache();
}

export async function setDisabled(id: number, disabled: boolean): Promise<void> {
  await exec(`UPDATE tracking_domains SET status = ? WHERE id = ?`, [disabled ? 'disabled' : 'pending', id]);
  clearDomainCache();
  if (!disabled) {
    const [d] = await q<DomainRow>(`SELECT * FROM tracking_domains WHERE id = ?`, [id]);
    if (d) await refreshDomain(d);
  }
}

/** Called by cron: re-checks domains still waiting for DNS/SSL, oldest check first. */
export async function refreshPending(limit = 20): Promise<number> {
  const rows = await q<DomainRow>(
    `SELECT * FROM tracking_domains WHERE status = 'pending' ORDER BY checked_at IS NOT NULL, checked_at LIMIT ?`, [limit],
  );
  for (const d of rows) await refreshDomain(d);
  return rows.length;
}

// ---- Lookup on the click path (cached, like links) ----

const cache = new Map<string, { owner: Owner | null; exp: number }>();

/** Owner of an active custom domain, or null if unknown/pending/disabled. */
export async function activeDomainOwner(hostname: string): Promise<Owner | null> {
  const hit = cache.get(hostname);
  if (hit && hit.exp > Date.now()) return hit.owner;
  const [d] = await q<{ owner_type: 'publisher' | 'advertiser'; owner_id: number }>(
    `SELECT owner_type, owner_id FROM tracking_domains WHERE hostname = ? AND status = 'active'`, [hostname],
  );
  const owner = d ? { type: d.owner_type, id: Number(d.owner_id) } : null;
  if (cache.size > 5000) cache.clear();
  cache.set(hostname, { owner, exp: Date.now() + 60_000 });
  return owner;
}

export function clearDomainCache() {
  cache.clear();
}

/** Active domains a publisher can use for an offer's link: theirs, plus the offer's advertiser's. */
export async function linkDomainOptions(publisherId: number, offerId: number) {
  const rows = await q<{ hostname: string; owner_type: string }>(
    `SELECT d.hostname, d.owner_type FROM tracking_domains d
     WHERE d.status = 'active' AND (
       (d.owner_type = 'publisher' AND d.owner_id = ?) OR
       (d.owner_type = 'advertiser' AND d.owner_id = (SELECT advertiser_id FROM offers WHERE id = ?)))
     ORDER BY d.owner_type = 'advertiser' DESC, d.id`,
    [publisherId, offerId],
  );
  return rows;
}
