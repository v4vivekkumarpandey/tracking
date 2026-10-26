// Where a click came from (pure, unit-tested). Best effort, strongest
// evidence first:
//   1. click IDs that ad networks append automatically (gclid, msclkid, …)
//   2. UTM tags
//   3. in-app browser user agents (Facebook, TikTok, …)
//   4. the Referer header
// Nothing at all → direct/unknown (apps and privacy settings often drop the
// referrer, so "direct" also means "couldn't tell").

export type Channel =
  | 'paid_search' | 'organic_search' | 'paid_social' | 'social' | 'email' | 'native' | 'push' | 'referral' | 'direct';
export type Classified = { source: string; channel: Channel; evidence: string; refererHost: string };

const CLICK_IDS: [param: string, source: string, channel: Channel][] = [
  ['gclid', 'google_ads', 'paid_search'],
  ['gbraid', 'google_ads', 'paid_search'],
  ['wbraid', 'google_ads', 'paid_search'],
  ['msclkid', 'bing_ads', 'paid_search'],
  ['ttclid', 'tiktok_ads', 'paid_social'],
  ['twclid', 'x_ads', 'paid_social'],
  ['li_fat_id', 'linkedin_ads', 'paid_social'],
  ['ScCid', 'snapchat_ads', 'paid_social'],
];

const PAID_MEDIUM = /^(cpc|ppc|cpm|cpv|paid|paid[_-]?social|paid[_-]?search|ads?|sem|display|paidsocial)$/i;

// utm_source spellings → our platform key.
const UTM_SOURCES: [RegExp, string][] = [
  [/^(google|adwords|googleads|google[_-]ads)$/i, 'google'],
  [/^(bing|microsoft|msn|bingads)$/i, 'bing'],
  [/^(facebook|fb|instagram|ig|meta|an|audience[_-]?network)$/i, 'meta'],
  [/^(tiktok|tt)$/i, 'tiktok'],
  [/^(twitter|x)$/i, 'x'],
  [/^linkedin$/i, 'linkedin'],
  [/^(snapchat|snap)$/i, 'snapchat'],
  [/^(youtube|yt)$/i, 'youtube'],
  [/^reddit$/i, 'reddit'],
  [/^pinterest$/i, 'pinterest'],
  [/^(taboola|outbrain|mgid|revcontent|yahoo[_-]?gemini)$/i, 'native'],
  [/^(email|newsletter|mailchimp|sendgrid|klaviyo|brevo)$/i, 'email'],
  [/^(push|onesignal|propellerads|pushground)$/i, 'push'],
];
const SEARCH = new Set(['google', 'bing']);

const IN_APP: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB|FBIOS|Instagram/i, 'meta'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'tiktok'],
  [/Snapchat/i, 'snapchat'],
  [/Pinterest/i, 'pinterest'],
  [/LinkedInApp/i, 'linkedin'],
  [/Twitter for|TwitterAndroid/i, 'x'],
  [/\bLine\//, 'line'],
];

// Referrer host → [source, channel]. Checked in order; first match wins.
const REFERRERS: [RegExp, string, Channel][] = [
  [/(^|\.)(googleadservices\.com|googlesyndication\.com|doubleclick\.net)$/, 'google_ads', 'paid_search'],
  [/^mail\.google\.com$|^outlook\.(live|office|office365)\.com$|^mail\.yahoo\.com$|(^|\.)mail\.[a-z0-9-]+\.[a-z.]+$/, 'email', 'email'],
  [/(^|\.)google\.[a-z.]+$/, 'google_organic', 'organic_search'],
  [/(^|\.)bing\.com$/, 'bing_organic', 'organic_search'],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, 'yahoo_organic', 'organic_search'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo_organic', 'organic_search'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex_organic', 'organic_search'],
  [/(^|\.)baidu\.com$/, 'baidu_organic', 'organic_search'],
  [/(^|\.)ecosia\.org$/, 'ecosia_organic', 'organic_search'],
  [/(^|\.)(facebook\.com|fb\.com|instagram\.com|messenger\.com)$/, 'meta', 'social'],
  [/^t\.co$|(^|\.)(twitter\.com|x\.com)$/, 'x', 'social'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'social'],
  [/(^|\.)reddit\.com$/, 'reddit', 'social'],
  [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, 'pinterest', 'social'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin', 'social'],
  [/(^|\.)tiktok\.com$/, 'tiktok', 'social'],
  [/(^|\.)snapchat\.com$/, 'snapchat', 'social'],
];

function hostOf(referer: string): string {
  try {
    return new URL(referer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** `selfHost`: our own tracking hosts; a referrer from them isn't a source. */
export function classify({ params, referer, ua, selfHost = '' }: {
  params: URLSearchParams; referer: string; ua: string; selfHost?: string;
}): Classified {
  const refererHost = hostOf(referer);
  const out = (source: string, channel: Channel, evidence: string): Classified => ({ source, channel, evidence, refererHost });

  // 1. Ad-network click IDs: added by the ad platform itself, hard to fake by accident.
  for (const [param, source, channel] of CLICK_IDS) {
    if (params.get(param)) return out(source, channel, `${param} parameter`);
  }
  const medium = (params.get('utm_medium') ?? '').trim();
  const utmSource = (params.get('utm_source') ?? '').trim();
  const paid = PAID_MEDIUM.test(medium);
  if (params.get('fbclid')) {
    // Facebook adds fbclid to every outbound link, paid or not.
    return paid ? out('meta_ads', 'paid_social', `fbclid + utm_medium=${medium}`) : out('meta', 'social', 'fbclid parameter');
  }

  // 2. UTM tags (set by whoever built the link).
  const platform = UTM_SOURCES.find(([re]) => re.test(utmSource))?.[1];
  if (platform || /^(email|push|native)$/i.test(medium)) {
    const ev = `utm_source=${utmSource || '–'}${medium ? `, utm_medium=${medium}` : ''}`;
    if (/^email$/i.test(medium) || platform === 'email') return out('email', 'email', ev);
    if (/^push$/i.test(medium) || platform === 'push') return out('push', 'push', ev);
    if (/^native$/i.test(medium) || platform === 'native') return out('native', 'native', ev);
    if (platform && SEARCH.has(platform)) return paid ? out(`${platform}_ads`, 'paid_search', ev) : out(`${platform}_organic`, 'organic_search', ev);
    if (platform) return paid ? out(`${platform}_ads`, 'paid_social', ev) : out(platform, 'social', ev);
  }

  // 3. In-app browsers identify themselves in the user agent.
  const app = IN_APP.find(([re]) => re.test(ua));
  if (app) return out(app[1], 'social', `${app[1]} in-app browser`);

  // 4. Referrer.
  if (refererHost && refererHost !== selfHost) {
    const hit = REFERRERS.find(([re]) => re.test(refererHost));
    if (hit) return out(hit[1], hit[2], `referrer ${refererHost}`);
    return out('referral', 'referral', `referrer ${refererHost}`);
  }
  return out('direct', 'direct', 'no referrer or tags');
}
