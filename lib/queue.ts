import { q } from './db';

export type Pending = { publishers: number; advertisers: number; access: number; offers: number; total: number };

/** Everything waiting for the admin, for the sidebar badge and dashboard banner. */
export async function pendingCounts(): Promise<Pending> {
  const [r] = await q<Record<string, string>>(
    `SELECT (SELECT COUNT(*) FROM publishers WHERE status = 'pending') AS publishers,
            (SELECT COUNT(*) FROM advertisers WHERE status = 'pending') AS advertisers,
            (SELECT COUNT(*) FROM publisher_offer_access WHERE status = 'pending') AS access,
            (SELECT COUNT(*) FROM offers WHERE status = 'pending') AS offers`,
  );
  const p = { publishers: +r.publishers, advertisers: +r.advertisers, access: +r.access, offers: +r.offers };
  return { ...p, total: p.publishers + p.advertisers + p.access + p.offers };
}
