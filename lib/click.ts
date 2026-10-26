import { NextResponse, type NextRequest } from 'next/server';
import { offerUsage } from './caps';
import { newClickId } from './clickid';
import { exec, q } from './db';
import { deepLinkTarget } from './deeplink';
import { deviceOf } from './device';
import { countryOf } from './geo';
import { linkFor, type Link } from './links';
import { expand } from './macros';
import { BOT_UA, trunc, type TrackingContext } from './request';
import { blockReason, type Block } from './routing';
import { trackingBase } from './format';
import { classify } from './trafficSource';

// Shared by /c/{code} (tracking links) and /s/{code} (smart links):
// targeting + caps with fallback, click recording, and the redirect.

const DUP_WINDOW_MS = 10_000; // same IP + offer again within this → duplicate

export type Visitor = { ip: string; ua: string; country: string; device: string; referer: string };

export async function visitorOf(req: NextRequest, ctx: TrackingContext): Promise<Visitor> {
  const ua = req.headers.get('user-agent') ?? '';
  return {
    ip: ctx.ip,
    ua,
    country: ctx.country || (await countryOf(ctx.ip)),
    device: deviceOf(ua),
    referer: trunc(req.headers.get('referer'), 512),
  };
}

export async function canServe(link: Link, v: Visitor): Promise<Block> {
  return blockReason(link.rules, v, await offerUsage(link.offerId));
}

/**
 * Serves one click on `link`. If the visitor doesn't match the offer's
 * targeting or the offer hit a cap, the click goes to the fallback offer
 * (one hop, if the publisher is approved on it), else the offer's fallback
 * URL, else the network FALLBACK_URL; with none of those, to the offer itself.
 */
export async function serveClick(req: NextRequest, link: Link, v: Visitor, opts: { smartLinkId?: number; checked?: boolean } = {}) {
  const sp = req.nextUrl.searchParams;
  const subs = [1, 2, 3, 4, 5].map((i) => trunc(sp.get(`sub${i}`), 255));

  const reason = opts.checked ? null : await canServe(link, v).catch(() => null);
  if (reason) {
    const fb = link.fallbackOfferId ? await linkFor(link.publisherId, link.fallbackOfferId).catch(() => null) : null;
    if (fb && fb.active && !(await canServe(fb, v).catch(() => 'cap' as const))) {
      await countRedirect(link);
      return redirectTo(req, fb, v, subs, opts.smartLinkId, null);
    }
    const url = link.fallbackUrl || process.env.FALLBACK_URL;
    if (url) {
      const clickId = await record(link, v, subs, opts.smartLinkId, reason, req.nextUrl.searchParams);
      return finish(expand(url, macroValues(link, clickId, subs)));
    }
    // No fallback configured: better to send the visitor to the offer than nowhere.
  }
  return redirectTo(req, link, v, subs, opts.smartLinkId, null);
}

async function redirectTo(req: NextRequest, link: Link, v: Visitor, subs: string[], smartLinkId: number | undefined, reason: Block) {
  const clickId = await record(link, v, subs, smartLinkId, reason, req.nextUrl.searchParams);
  const url = req.nextUrl.searchParams.get('url');
  // Deep link (?url=…): only to the offer's own site, and only if allowed.
  const deep = link.deeplinkEnabled && url ? deepLinkTarget(url, link.destination, link.deeplinkParam, clickId) : null;
  return finish(deep ?? expand(link.destination, macroValues(link, clickId, subs)));
}

function macroValues(link: Link, clickId: string, subs: string[]): Record<string, string> {
  const vals: Record<string, string> = {
    click_id: clickId, offer_id: String(link.offerId), pub_id: String(link.publisherId), publisher_id: String(link.publisherId),
  };
  subs.forEach((s, i) => (vals[`sub${i + 1}`] = s));
  return vals;
}

function finish(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  return res;
}

const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

/** Records the click (never throws: a database hiccup must not block the visitor). */
async function record(link: Link, v: Visitor, subs: string[], smartLinkId: number | undefined, reason: Block, params: URLSearchParams): Promise<string> {
  const now = new Date();
  const clickId = newClickId(link.offerId, link.publisherId, link.id, now);
  try {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [prev] = await q<{ last: Date | null }>(
      `SELECT MAX(ts) AS last FROM clicks WHERE offer_id = ? AND ip = ? AND ts >= ?`, [link.offerId, v.ip, dayStart],
    );
    const unique = !prev?.last;
    const isDup = !!prev?.last && now.getTime() - new Date(prev.last).getTime() < DUP_WINDOW_MS;
    const isBot = !v.ua || BOT_UA.test(v.ua);
    const src = classify({ params, referer: v.referer, ua: v.ua, selfHost: new URL(trackingBase()).hostname });
    await exec(
      `INSERT INTO clicks (click_id, ts, offer_id, publisher_id, link_id, ip, ua, referer, country, device,
                           sub1, sub2, sub3, sub4, sub5, is_bot, is_duplicate, smart_link_id, redirect_reason,
                           traffic_source, traffic_channel, referer_host, source_evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clickId, now, link.offerId, link.publisherId, link.id, v.ip, trunc(v.ua, 512), v.referer, v.country.slice(0, 2), v.device,
       ...subs, isBot, isDup, smartLinkId ?? null, reason,
       src.source, src.channel, src.refererHost.slice(0, 100), src.evidence.slice(0, 100)],
    );
    // A click sent to a fallback URL counts as "redirected", not as a click
    // on the offer, so the offer's conversion rate stays honest.
    const clicks = reason ? 0 : 1;
    const uniq = !reason && unique ? 1 : 0;
    const flagged = !reason && (isBot || isDup) ? 1 : 0;
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
