// Pure hostname rules for custom tracking domains (no imports, unit-tested).

/** The registrable part we own, e.g. "ossaward.org" for "trk.ossaward.org". */
export function rootDomain(host: string): string {
  return host.split('.').slice(-2).join('.');
}

/**
 * Turns what a user typed ("Track.MySite.com", "https://track.mysite.com/")
 * into a bare lowercase hostname, or throws a readable error.
 */
export function normalizeHostname(input: string, primaryHost: string): string {
  let raw = input.trim();
  if (!raw) throw new Error('Enter a domain, e.g. track.yoursite.com');
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `http://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('That does not look like a domain name.');
  }
  if (u.port) throw new Error('Leave out the port; enter just the domain.');
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash || u.username) {
    throw new Error('Enter just the domain, without a path, e.g. track.yoursite.com');
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, ''); // URL() converts IDN to punycode
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[')) {
    throw new Error('Use a domain name, not an IP address.');
  }
  const labels = host.split('.');
  if (labels.length < 2 || host.length > 253) throw new Error('Use a full domain such as track.yoursite.com');
  if (!labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) {
    throw new Error('A domain can contain only letters, numbers, dots and hyphens.');
  }
  if (!/[a-z]/.test(labels[labels.length - 1])) throw new Error('That does not look like a valid domain ending.');
  const ours = rootDomain(primaryHost.toLowerCase());
  if (host === ours || host.endsWith(`.${ours}`)) throw new Error('Use a domain you own, not ours.');
  return host;
}
