// Replaces {name} placeholders with URL-encoded values. Placeholders without
// a value become empty so advertisers never receive a literal "{sub3}".
// Same behaviour as Expand in the Go tracker.
const MACRO = /\{([a-z0-9_]{1,32})\}/g;

export function expand(tmpl: string, vals: Record<string, string>): string {
  return tmpl.replace(MACRO, (_, name: string) => encode(vals[name] ?? ''));
}

// Matches Go's url.QueryEscape: spaces become "+".
function encode(v: string): string {
  return encodeURIComponent(v)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
