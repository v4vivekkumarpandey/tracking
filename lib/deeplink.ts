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

const onDomain = (host: string, domain: string) => {
  const base = baseOf(domain);
  return host === domain || host === base || host.endsWith(`.${base}`);
};

/** The parsed URL if it's http(s) and on the offer's site or an extra allowed domain; null otherwise. */
function allowedUrl(raw: string, destination: string, extraDomains: string[]): URL | null {
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
  return [home, ...extraDomains].some((d) => onDomain(host, d)) ? u : null;
}

/**
 * Returns the deep-link destination with the click ID added under `param`,
 * or null if the URL isn't allowed (bad scheme or a different site).
 */
export function deepLinkTarget(raw: string, destination: string, param: string, clickId: string): string | null {
  const u = allowedUrl(raw, destination, []);
  if (!u) return null;
  u.searchParams.set(param, clickId);
  return u.toString();
}

/**
 * Where ?redirection_url=… sends the visitor: the URL exactly as given when
 * transparent (force_transparent), otherwise with the click ID added. Null if
 * the URL isn't on the offer's site or an extra allowed domain.
 */
export function redirectTarget(raw: string, destination: string, extraDomains: string[], param: string, clickId: string, transparent: boolean): string | null {
  const u = allowedUrl(raw, destination, extraDomains);
  if (!u) return null;
  if (transparent) return raw;
  u.searchParams.set(param, clickId);
  return u.toString();
}

/** Checks the admin's list of extra domains; returns them comma-separated, or null if empty. */
export function parseDomains(text: string): string | null {
  const domains = [...new Set(text.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  const bad = domains.find((d) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
  if (bad) throw new Error(`"${bad}" isn't a domain. Use the form go.sjv.io, without https:// or *.`);
  const joined = domains.join(',');
  if (joined.length > 500) throw new Error('Too many allowed domains (500 characters at most).');
  return joined || null;
}
