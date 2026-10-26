import { parseClickId } from './clickid';
import type { Scope } from './dashboard';
import { q } from './db';
import { parseIp } from './ipRules';

// Raw click search and click-ID lookup for the Click log pages. Scoped like
// every other query: publishers see their own clicks, advertisers clicks on
// their own offers. Visitor IP and network are admin-only.

export const CLICK_ID_RE = /^[a-z2-7]{40,80}$/i;
export const FLAGS = ['', 'flagged', 'blocked', 'redirected', 'converted'] as const;
export type Flag = (typeof FLAGS)[number];
export type ClickFilters = { q: string; days: number; offer: number | null; publisher: number | null; flag: Flag };

export function parseFilters(sp: Record<string, string | undefined>): ClickFilters {
  const n = (v?: string) => (v && /^\d{1,12}$/.test(v) ? Number(v) : null);
  const days = Number(sp.days);
  return {
    q: (sp.q ?? '').trim().slice(0, 255),
    days: [1, 7, 30, 90].includes(days) ? days : 7,
    offer: n(sp.offer),
    publisher: n(sp.publisher),
    flag: (FLAGS as readonly string[]).includes(sp.flag ?? '') ? (sp.flag as Flag) : '',
  };
}

export type ClickRow = {
  click_id: string; ts: Date; offer_id: number; offer: string; publisher_id: number; publisher: string;
  ip: string; asn: number | null; asn_org: string; ip_type: string; country: string; device: string; ua: string;
  traffic_source: string; referer_host: string; sub1: string; sub2: string;
  is_bot: number; is_duplicate: number; redirect_reason: string | null; lp_name: string | null; conv: number;
};

export async function searchClicks(scope: Scope, f: ClickFilters, admin: boolean): Promise<ClickRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (sql: string, ...v: (string | number)[]) => { where.push(sql); params.push(...v); };

  if (scope.kind === 'publisher') add('c.publisher_id = ?', scope.id);
  if (scope.kind === 'advertiser') add('o.advertiser_id = ?', scope.id);
  if (f.offer) add('c.offer_id = ?', f.offer);
  if (admin && f.publisher) add('c.publisher_id = ?', f.publisher);

  const term = f.q;
  if (term && CLICK_ID_RE.test(term)) add('c.click_id = ?', term.toLowerCase());
  else {
    add('c.ts >= UTC_TIMESTAMP() - INTERVAL ? DAY', f.days);
    if (term && admin && parseIp(term)) add('c.ip = ?', term);
    else if (term && admin && /^AS\d{1,10}$/i.test(term)) add('c.asn = ?', Number(term.slice(2)));
    else if (term) add('(c.sub1 = ? OR c.sub2 = ? OR c.sub3 = ? OR c.sub4 = ? OR c.sub5 = ?)', term, term, term, term, term);
  }
  if (f.flag === 'flagged') add(`(c.is_bot = 1 OR c.is_duplicate = 1 OR c.ip_type <> '')`);
  if (f.flag === 'blocked') add(`c.redirect_reason IN ('ip', 'dc')`);
  if (f.flag === 'redirected') add('c.redirect_reason IS NOT NULL');
  if (f.flag === 'converted') add('EXISTS (SELECT 1 FROM conversions cv WHERE cv.click_id = c.click_id)');

  return q<ClickRow>(
    `SELECT c.click_id, c.ts, c.offer_id, o.name AS offer, c.publisher_id, p.name AS publisher,
            c.ip, c.asn, c.asn_org, c.ip_type, c.country, c.device, c.ua, c.traffic_source, c.referer_host, c.sub1, c.sub2,
            c.is_bot, c.is_duplicate, c.redirect_reason, lp.name AS lp_name,
            (SELECT COUNT(*) FROM conversions cv WHERE cv.click_id = c.click_id) AS conv
     FROM clicks c
     JOIN offers o ON o.id = c.offer_id
     JOIN publishers p ON p.id = c.publisher_id
     LEFT JOIN offer_landing_pages lp ON lp.id = c.lp_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.ts DESC LIMIT 200`,
    params,
  );
}

export type Lookup = {
  offerId: number; offer: string; publisherId: number; publisher: string; time: Date; stored: boolean;
  conversions: { id: number; goal: string; status: string; created_at: Date; fraud_score: number; reject_reason: string | null }[];
  postbacks: { id: number; created_at: Date; source: string; status: string; message: string | null }[];
};

/**
 * Everything known about one click ID: who it belongs to (from the signed ID
 * itself, even after the raw click was deleted), whether the click is stored,
 * its conversions and every postback received for it. Null if the ID is
 * invalid or belongs to someone else.
 */
export async function lookupClick(scope: Scope, clickId: string): Promise<Lookup | null> {
  const id = clickId.toLowerCase();
  const c = parseClickId(id);
  if (!c) return null;
  const [o] = await q<{ name: string; advertiser_id: number; publisher: string | null }>(
    `SELECT o.name, o.advertiser_id, (SELECT name FROM publishers WHERE id = ?) AS publisher FROM offers o WHERE o.id = ?`,
    [c.publisherId, c.offerId],
  );
  if (!o) return null;
  if (scope.kind === 'publisher' && scope.id !== c.publisherId) return null;
  if (scope.kind === 'advertiser' && scope.id !== Number(o.advertiser_id)) return null;
  const [[stored], conversions, postbacks] = await Promise.all([
    q<{ n: number }>(`SELECT COUNT(*) AS n FROM clicks WHERE click_id = ?`, [id]),
    q<Lookup['conversions'][number]>(
      `SELECT id, goal, status, created_at, fraud_score, reject_reason FROM conversions WHERE click_id = ? ORDER BY id`, [id],
    ),
    // Publishers never see the advertiser's postback calls.
    scope.kind === 'publisher' ? Promise.resolve([]) : q<Lookup['postbacks'][number]>(
      `SELECT id, created_at, source, status, message FROM postback_log WHERE click_id = ? ORDER BY id DESC LIMIT 20`, [id],
    ),
  ]);
  return {
    offerId: c.offerId, offer: o.name, publisherId: c.publisherId, publisher: o.publisher ?? `#${c.publisherId}`,
    time: c.time, stored: Number(stored.n) > 0, conversions, postbacks,
  };
}
