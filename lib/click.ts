import { NextResponse, type NextRequest } from 'next/server';
import { offerUsage } from './caps';
import { newClickId } from './clickid';
import { exec, q } from './db';
import { deepLinkTarget } from './deeplink';
import { deviceOf, osOf } from './device';
import { LINK_TEST_HEADER, isLinkTest } from './linkTestToken';
import { countryOf } from './geo';
import { blockedBy, ipInfo } from './ipIntel';
import { linkFor, type Link } from './links';
import { expand } from './macros';
import { BOT_UA, trunc, type TrackingContext } from './request';
import { blockReason, pickLanding, type Block } from './routing';
import { trackingBase } from './format';
import { getSettingsCached } from './settings';
import { SUB_FIELDS, subsFrom, type SubValues } from './subs';
import { classify } from './trafficSource';

// Shared by /c/{code} (tracking links) and /s/{code} (smart links):
// IP protection, targeting + caps with fallback, landing page choice, click
// recording, and the redirect.

const DUP_WINDOW_MS = 10_000; // same IP + offer again within this → duplicate

export type Visitor = {
  ip: string; ua: string; country: string; device: string; os: string; referer: string;
  asn: number | null; asnOrg: string; datacenter: boolean;
  /** A Link Test run from the panel: recorded as a bot click, left out of stats. */
  test: boolean;
};

export async function visitorOf(req: NextRequest, ctx: TrackingContext): Promise<Visitor> {
  const ua = req.headers.get('user-agent') ?? '';
  const [country, net] = await Promise.all([ctx.country || countryOf(ctx.ip), ipInfo(ctx.ip)]);
  return {
    ip: ctx.ip,
    ua,
    country,
    device: deviceOf(ua),
    os: osOf(ua),
    test: isLinkTest(req.headers.get(LINK_TEST_HEADER)),
    referer: trunc(req.headers.get('referer'), 512),
    asn: net.asn,
    asnOrg: net.org,
    datacenter: net.datacenter,
  };
}

export async function canServe(link: Link, v: Visitor): Promise<Block> {
  return blockReason(link.rules, v, await offerUsage(link.offerId));
}

/** The admin blocklist, then data-center traffic when Protection is set to block it. */
export async function protectionBlock(v: Visitor): Promise<Block> {
  if (v.test) return null; // the test runs from our own server, a data center
  if (await blockedBy(v.ip, v.asn)) return 'ip';
  if (v.datacenter && (await getSettingsCached()).datacenter_traffic === 'block') return 'dc';
  return null;
}

/**
 * Serves one click on `link`. Blocked visitors (IP blocklist, data centers)
 * only ever get the offer's fallback URL or a 404. If the visitor doesn't
 * match the offer's targeting or the offer hit a cap, the click goes to the
 * fallback offer (one hop, if the publisher is approved on it), else the
 * offer's fallback URL, else the network FALLBACK_URL; with none of those, to
 * the offer itself.
 */
export async function serveClick(req: NextRequest, link: Link, v: Visitor, opts: { smartLinkId?: number; checked?: boolean } = {}) {
  const sp = req.nextUrl.searchParams;
  const subs = subsFrom(sp);

  const shield = await protectionBlock(v).catch(() => null);
  if (shield) {
    const clickId = await record(link, v, subs, opts.smartLinkId, shield, sp, null);
    const url = link.fallbackUrl || process.env.FALLBACK_URL;
    return url ? finish(expand(url, macroValues(link, clickId, subs)))
      : new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const reason = opts.checked ? null : await canServe(link, v).catch(() => null);
  if (reason) {
    const fb = link.fallbackOfferId ? await linkFor(link.publisherId, link.fallbackOfferId).catch(() => null) : null;
    if (fb && fb.active && !(await canServe(fb, v).catch(() => 'cap' as const))) {
      await countRedirect(link);
      return redirectTo(req, fb, v, subs, opts.smartLinkId);
    }
    const url = link.fallbackUrl || process.env.FALLBACK_URL;
    if (url) {
      const clickId = await record(link, v, subs, opts.smartLinkId, reason, sp, null);
      return finish(expand(url, macroValues(link, clickId, subs)));
    }
    // No fallback configured: better to send the visitor to the offer than nowhere.
  }
  return redirectTo(req, link, v, subs, opts.smartLinkId);
}

async function redirectTo(req: NextRequest, link: Link, v: Visitor, subs: SubValues, smartLinkId: number | undefined) {
  const sp = req.nextUrl.searchParams;
  const lp = pickLanding(link.landingPages, Number(sp.get('lp')) || null);
  const clickId = await record(link, v, subs, smartLinkId, null, sp, lp?.id ?? null);
  const url = sp.get('url');
  // Deep link (?url=…): only to the offer's own site, and only if allowed.
  const deep = link.deeplinkEnabled && url ? deepLinkTarget(url, link.destination, link.deeplinkParam, clickId) : null;
  const res = finish(deep ?? expand(lp?.url ?? link.destination, macroValues(link, clickId, subs)));
  setClickCookie(res, link, clickId);
  return res;
}

/**
 * Remembers the latest click per offer on the tracking domain, so a pixel
 * fired without click_id (/px?offer_id=…) can still be matched. Works where
 * third-party cookies are allowed, or always on the advertiser's own domain.
 */
function setClickCookie(res: NextResponse, link: Link, clickId: string) {
  const secure = process.env.SECURE_COOKIES !== 'false';
  res.cookies.set(`_trk_o${link.offerId}`, clickId, {
    httpOnly: true, path: '/', maxAge: Math.min(link.attributionDays, 400) * 86_400,
    sameSite: secure ? 'none' : 'lax', secure,
  });
}

function macroValues(link: Link, clickId: string, subs: SubValues): Record<string, string> {
  return {
    ...subs,
    click_id: clickId, offer_id: String(link.offerId), pub_id: String(link.publisherId), publisher_id: String(link.publisherId),
  };
}

function finish(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  return res;
}

const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

/** Records the click (never throws: a database hiccup must not block the visitor). */
async function record(link: Link, v: Visitor, subs: SubValues, smartLinkId: number | undefined, reason: Block,
  params: URLSearchParams, lpId: number | null): Promise<string> {
  const now = new Date();
  const clickId = newClickId(link.offerId, link.publisherId, link.id, now);
  try {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [prev] = await q<{ last: Date | null }>(
      `SELECT MAX(ts) AS last FROM clicks WHERE offer_id = ? AND ip = ? AND ts >= ?`, [link.offerId, v.ip, dayStart],
    );
    const unique = !prev?.last;
    const isDup = !!prev?.last && now.getTime() - new Date(prev.last).getTime() < DUP_WINDOW_MS;
    const isBot = v.test || !v.ua || BOT_UA.test(v.ua);
    const ipType = reason === 'ip' || reason === 'dc' ? 'blocked' : v.datacenter && !v.test ? 'datacenter' : '';
    const src = v.test ? { source: 'direct', channel: 'direct', refererHost: '', evidence: 'link test from the panel' }
      : classify({ params, referer: v.referer, ua: v.ua, selfHost: new URL(trackingBase()).hostname });
    await exec(
      `INSERT INTO clicks (click_id, ts, offer_id, publisher_id, link_id, ip, ua, referer, country, device,
                           ${SUB_FIELDS.join(', ')}, is_bot, is_duplicate, smart_link_id, redirect_reason,
                           traffic_source, traffic_channel, referer_host, source_evidence, asn, asn_org, ip_type, lp_id)
       VALUES (${Array(33).fill('?').join(', ')})`,
      [clickId, now, link.offerId, link.publisherId, link.id, v.ip, trunc(v.ua, 512), v.referer, v.country.slice(0, 2), v.device,
       ...SUB_FIELDS.map((k) => subs[k]), isBot, isDup, smartLinkId ?? null, reason,
       src.source, src.channel, src.refererHost.slice(0, 100), src.evidence.slice(0, 100),
       v.asn, v.asnOrg, ipType, lpId],
    );
    if (v.test) return clickId; // stored for the Click log, but not counted
    // A click sent to a fallback URL counts as "redirected", not as a click
    // on the offer, so the offer's conversion rate stays honest.
    const clicks = reason ? 0 : 1;
    const uniq = !reason && unique ? 1 : 0;
    const flagged = !reason && (isBot || isDup || v.datacenter) ? 1 : 0;
    const redirected = reason ? 1 : 0;
    await exec(
      `INSERT INTO stats_hourly (hour, offer_id, publisher_id, clicks, uniques, flagged, redirected) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE clicks = clicks + ?, uniques = uniques + ?, flagged = flagged + ?, redirected = redirected + ?`,
      [hourOf(now), link.offerId, link.publisherId, clicks, uniq, flagged, redirected, clicks, uniq, flagged, redirected],
    );
  } catch (err) {
    console.error('record click', err);
  }
  return clickId;
}

/** The visitor was moved to a fallback offer: count it against the original. */
async function countRedirect(link: Link) {
  await exec(
    `INSERT INTO stats_hourly (hour, offer_id, publisher_id, redirected) VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE redirected = redirected + 1`,
    [hourOf(new Date()), link.offerId, link.publisherId],
  ).catch((e) => console.error('count redirect', e));
}
