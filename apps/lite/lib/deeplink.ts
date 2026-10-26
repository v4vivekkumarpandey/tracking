// Deep links: /c/{code}?url=https://brand.com/some/product sends the visitor
// to that page instead of the offer's default landing page, if the offer
// allows it and the URL is on the offer's own domain. No other site is
// accepted, otherwise tracking links would become open redirects.

/**
 * The landing host without a leading "www.". Deep links may go to that host
 * or its subdomains: www.brand.com allows brand.com and shop.brand.com. It
 * deliberately doesn't guess at "registrable domains": taking the last two
 * labels would turn brand.co.uk into all of .co.uk.
 */
function baseOf(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** Host of the offer's landing page (macros removed so it parses). */
export function landingHost(destination: string): string | null {
  try {
    return new URL(destination.replace(/\{[a-z0-9_]+\}/g, 'x')).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns the deep-link destination with the click ID added under `param`,
 * or null if the URL isn't allowed (bad scheme or a different site).
 */
export function deepLinkTarget(raw: string, destination: string, param: string, clickId: string): string | null {
  const home = landingHost(destination);
  if (!home || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const base = baseOf(home);
  if (host !== home && host !== base && !host.endsWith(`.${base}`)) return null;
  u.searchParams.set(param, clickId);
  return u.toString();
}
