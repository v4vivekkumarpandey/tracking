import { createHash, timingSafeEqual } from 'node:crypto';
import { parseClickId, type Click } from './clickid';
import { fraudScore } from './fraud';
import { sourceLabel } from './sourceLabels';
import { exec, isDuplicate, q, tx } from './db';
import { expand } from './macros';
import { processOutbox } from './outbox';

const AMOUNT = /^\d{1,12}(\.\d{1,4})?$/;
const TOKEN = /^[A-Za-z0-9_.:\-]{0,128}$/;

export type Result = { status: 'ok' | 'duplicate' | 'rejected' | 'error'; conversion_id?: number; error?: string };

const same = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Revenue and payout are computed in SQL DECIMAL, never JS floats:
// goal price > % of sale amount > offer default; a per-publisher payout
// override beats everything. Sub IDs are copied from the click.
const INSERT_SQL = `
INSERT INTO conversions
  (click_id, click_time, offer_id, publisher_id, link_id, goal, txn_id, txn_key,
   amount, revenue, payout, source, ip, fraud_score, fraud_reasons, sub1, sub2, sub3, sub4, sub5,
   traffic_source, traffic_channel, lp_id)
SELECT ?, ?, o.id, ?, ?, ?, ?, NULLIF(?, ''),
  CAST(? AS DECIMAL(14,2)),
  ROUND(COALESCE(g.revenue,
        CASE WHEN o.revenue_percent IS NOT NULL THEN CAST(? AS DECIMAL(14,4)) * o.revenue_percent / 100
             ELSE o.default_revenue END), 2),
  ROUND(COALESCE(a.payout_override, g.payout,
        CASE WHEN o.payout_percent IS NOT NULL THEN CAST(? AS DECIMAL(14,4)) * o.payout_percent / 100
             ELSE o.default_payout END), 2),
  ?, ?, ?, ?,
  COALESCE(c.sub1, ''), COALESCE(c.sub2, ''), COALESCE(c.sub3, ''), COALESCE(c.sub4, ''), COALESCE(c.sub5, ''),
  COALESCE(c.traffic_source, ''), COALESCE(c.traffic_channel, ''), c.lp_id
FROM offers o
LEFT JOIN offer_goals g ON g.offer_id = o.id AND g.code = ?
LEFT JOIN publisher_offer_access a ON a.offer_id = o.id AND a.publisher_id = ?
LEFT JOIN clicks c ON c.click_id = ?
WHERE o.id = ?`;

/** Records a conversion reported by an advertiser (s2s) or a browser pixel. */
export async function recordConversion(params: URLSearchParams, source: 's2s' | 'pixel', ip: string): Promise<[number, Result]> {
  const clickId = (params.get('click_id') ?? '').toLowerCase();
  const goal = params.get('goal') ?? '';
  const txnId = params.get('txn_id') ?? '';
  const amount = params.get('amount') || '0';

  const done = (code: number, res: Result, msg = res.error ?? '') => {
    log(clickId, source, ip, params, res.status, msg);
    return [code, res] as [number, Result];
  };
  const reject = (code: number, error: string) => done(code, { status: 'rejected', error });

  if (!TOKEN.test(goal) || !TOKEN.test(txnId)) return reject(400, 'goal and txn_id must be max 128 chars of [A-Za-z0-9_.:-]');
  if (!AMOUNT.test(amount)) return reject(400, 'invalid amount');
  const click = parseClickId(clickId);
  if (!click) return reject(400, 'invalid click_id');

  const [offer] = await q<{ status: string; attribution_days: number; secret: string; goal_known: number }>(
    `SELECT o.status, o.attribution_days, adv.postback_secret AS secret, (g.id IS NOT NULL) AS goal_known
     FROM offers o JOIN advertisers adv ON adv.id = o.advertiser_id
     LEFT JOIN offer_goals g ON g.offer_id = o.id AND g.code = ?
     WHERE o.id = ?`,
    [goal, click.offerId],
  );
  if (!offer) return reject(404, 'unknown offer');
  if (source === 's2s' && !same(params.get('secret') ?? '', offer.secret)) return reject(403, 'bad secret');
  if (offer.status !== 'active') return reject(409, 'offer not active');
  if (goal && !Number(offer.goal_known)) return reject(400, 'unknown goal');
  if (Date.now() - click.time.getTime() > offer.attribution_days * 86_400_000) {
    return reject(409, 'click outside attribution window');
  }

  const risk = await scoreConversion(clickId, click);

  try {
    const id = await tx(async (t) => {
      const ins = await t.exec(INSERT_SQL, [
        clickId, click.time, click.publisherId, click.linkId, goal, txnId, txnId,
        amount, amount, amount, source, ip, risk.score, risk.reasons.join('; ').slice(0, 255) || null,
        goal, click.publisherId, clickId, click.offerId,
      ]);
      if (ins.affectedRows === 0) return 0;
      const convId = ins.insertId;
      const [c] = await t.q<Record<string, string>>(
        `SELECT payout, amount, sub1, sub2, sub3, sub4, sub5 FROM conversions WHERE id = ?`,
        [convId],
      );
      // Queue one postback per matching publisher URL, in the same
      // transaction, so a conversion always gets its postbacks.
      const urls = await t.q<{ url: string }>(
        `SELECT url FROM publisher_postbacks
         WHERE publisher_id = ? AND active = 1
           AND (offer_id IS NULL OR offer_id = ?) AND (goal IS NULL OR goal = ?)`,
        [click.publisherId, click.offerId, goal],
      );
      const vals: Record<string, string> = {
        click_id: clickId, conversion_id: String(convId), offer_id: String(click.offerId),
        pub_id: String(click.publisherId), goal, txn_id: txnId, amount: c.amount, payout: c.payout,
        status: 'pending', sub1: c.sub1, sub2: c.sub2, sub3: c.sub3, sub4: c.sub4, sub5: c.sub5,
      };
      for (const u of urls) {
        await t.exec(`INSERT INTO outbox (kind, ref_id, payload) VALUES ('http_get', ?, ?)`, [
          convId, JSON.stringify({ url: expand(u.url, vals) }),
        ]);
      }
      return convId;
    });
    if (!id) return reject(404, 'unknown offer');

    processOutbox().catch((e) => console.error('outbox', e)); // send now, not at next cron
    return done(200, { status: 'ok', conversion_id: id });
  } catch (err) {
    if (isDuplicate(err)) return done(200, { status: 'duplicate' });
    console.error('insert conversion', err);
    return [500, { status: 'error' }];
  }
}

/** Gathers fraud signals for a conversion; never fails the conversion itself. */
async function scoreConversion(clickId: string, click: Click) {
  try {
    const [s] = await q<Record<string, string | Date | null>>(
      `SELECT c.ts AS click_ts, c.is_bot AS bot, c.is_duplicate AS dup, c.traffic_source AS src, c.ip_type, c.asn_org,
              (SELECT blocked_sources FROM offers WHERE id = ?) AS blocked,
              -- Same visitor IP (from the clicks), not the request IP: for S2S
              -- postbacks the request comes from the advertiser's server.
              (SELECT COUNT(*) FROM conversions cv JOIN clicks ck ON ck.click_id = cv.click_id
               WHERE cv.offer_id = ? AND ck.ip = c.ip AND c.ip <> '' AND cv.created_at >= UTC_DATE()) AS same_ip,
              (SELECT COALESCE(SUM(clicks), 0) FROM stats_hourly WHERE publisher_id = ? AND hour >= UTC_DATE()) AS pc_today,
              (SELECT COUNT(*) FROM conversions WHERE publisher_id = ? AND created_at >= UTC_DATE()) AS pv_today,
              (SELECT COALESCE(SUM(clicks), 0) FROM stats_hourly WHERE publisher_id = ? AND hour >= UTC_DATE() - INTERVAL 7 DAY AND hour < UTC_DATE()) AS pc_7d,
              (SELECT COUNT(*) FROM conversions WHERE publisher_id = ? AND created_at >= UTC_DATE() - INTERVAL 7 DAY AND created_at < UTC_DATE()) AS pv_7d
       FROM (SELECT 1) one LEFT JOIN clicks c ON c.click_id = ?`,
      [click.offerId, click.offerId, click.publisherId, click.publisherId, click.publisherId, click.publisherId, clickId],
    );
    const retentionMs = Math.max(7, Number(process.env.CLICK_RETENTION_DAYS ?? 90)) * 86_400_000;
    const pcToday = Number(s.pc_today), pvToday = Number(s.pv_today), pc7 = Number(s.pc_7d), pv7 = Number(s.pv_7d);
    return fraudScore({
      ctit: s.click_ts ? (Date.now() - new Date(s.click_ts as Date).getTime()) / 1000 : null,
      clickExpected: Date.now() - click.time.getTime() < retentionMs,
      clickBot: Number(s.bot) === 1,
      clickDuplicate: Number(s.dup) === 1,
      sameIpToday: Number(s.same_ip),
      pubClicksToday: pcToday,
      pubConvToday: pvToday + 1, // including this one
      pubCrToday: pcToday ? (pvToday + 1) / pcToday : 0,
      pubCr7d: pc7 ? pv7 / pc7 : 0,
      clickDatacenter: s.ip_type === 'datacenter' ? String(s.asn_org || 'unknown network') : null,
      disallowedSource: s.src && String(s.blocked ?? '').split(',').includes(String(s.src)) ? sourceLabel(String(s.src)) : null,
    });
  } catch (e) {
    console.error('fraud score', e);
    return { score: 0, reasons: [] as string[] };
  }
}

// Keeps every postback received, which answers "we sent 120, you show 117".
function log(clickId: string, source: string, ip: string, params: URLSearchParams, status: string, message: string) {
  const p: Record<string, string> = {};
  params.forEach((v, k) => {
    if (k !== 'secret') p[k] = v;
  });
  // Only a validly signed click ID tells us the offer (and so the advertiser).
  const offerId = parseClickId(clickId)?.offerId ?? null;
  exec(
    `INSERT INTO postback_log (click_id, offer_id, source, ip, params, status, message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clickId.slice(0, 64), offerId, source, ip, JSON.stringify(p), status, message.slice(0, 255) || null],
  ).catch((e) => console.error('postback_log insert', e));
}
