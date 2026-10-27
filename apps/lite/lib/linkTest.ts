import { parseClickId } from './clickid';
import { q } from './db';
import { trackingBase } from './format';
import { LINK_TEST_HEADER, linkTestToken } from './linkTestToken';
import { assertPublicUrl } from './safeUrl';
import { TEST_DEVICES, type TestDevice } from './testDevices';

// Link Test: follows a tracking link hop by hop from this server and reports
// each redirect with its timing, like an external redirect tracer. Our own
// hop sends a signed header, so the test click is stored as a bot click and
// left out of the stats. Only our tracking links can be tested (never
// arbitrary URLs), and every outside hop must be a public address.

export type { TestDevice } from './testDevices';

export type Hop = { url: string; status: number | null; ms: number; appMs: number | null; via: string; error?: string };
export type Trace = {
  error?: string;
  hops?: Hop[];
  totalMs?: number;
  clickId?: string | null;
  /** Hops (by index) and the parameter names that carried our click ID onward. */
  carried?: { hop: number; params: string[] }[];
  note?: string;
} | null;

const MAX_HOPS = 10;
const TIMEOUT_MS = 8000;

async function ownHosts(): Promise<Set<string>> {
  const rows = await q<{ hostname: string }>(`SELECT hostname FROM tracking_domains WHERE status = 'active'`);
  return new Set([new URL(trackingBase()).host, ...rows.map((r) => r.hostname)]);
}

/** Checks the start URL is one of our tracking links (and, for a publisher, their own). */
async function checkStart(raw: string, publisherId: number | null): Promise<URL | string> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return 'Paste a full tracking link, starting with https://';
  }
  if (!(await ownHosts()).has(u.host)) return `Only tracking links on ${new URL(trackingBase()).host} or your active tracking domains can be tested.`;
  const m = u.pathname.match(/^\/(c|s)\/([A-Za-z0-9_-]{1,32})$/);
  if (!m) return 'That is not a tracking link (it should look like /c/AbC123 or /s/AbC123).';
  if (publisherId !== null) {
    const table = m[1] === 'c' ? 'tracking_links' : 'smart_links';
    const [own] = await q(`SELECT 1 FROM ${table} WHERE code = ? AND publisher_id = ?`, [m[2], publisherId]);
    if (!own) return 'You can only test your own tracking links.';
  }
  return u;
}

/** A click ID of ours among the URL's query values, if any. */
function clickIdIn(u: URL): string | null {
  for (const v of u.searchParams.values()) if (v.length >= 40 && v.length <= 80 && parseClickId(v.toLowerCase())) return v.toLowerCase();
  return null;
}

/** `<meta http-equiv="refresh" content="0; url=…">` target, if the page has one. */
function metaRefresh(html: string, base: string): string | null {
  const m = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i);
  if (!m) return null;
  try { return new URL(m[1].replace(/&amp;/g, '&'), base).toString(); } catch { return null; }
}

export async function traceLink(raw: string, publisherId: number | null, device: TestDevice = 'desktop'): Promise<Trace> {
  const start = await checkStart(raw, publisherId);
  if (typeof start === 'string') return { error: start };
  const own = await ownHosts();
  const ua = (TEST_DEVICES[device] ?? TEST_DEVICES.desktop).ua;

  const hops: Hop[] = [];
  let url = start.toString();
  let via = 'start';
  let note: string | undefined;
  const t0 = performance.now();
  for (let i = 0; i < MAX_HOPS; i++) {
    const u = new URL(url);
    const ours = own.has(u.host);
    if (!ours) {
      try {
        await assertPublicUrl(url);
      } catch (e) {
        hops.push({ url, status: null, ms: 0, appMs: null, via, error: (e as Error).message });
        break;
      }
    }
    const h0 = performance.now();
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': ua, accept: 'text/html,*/*', 'accept-language': 'en-US,en;q=0.9', ...(ours ? { [LINK_TEST_HEADER]: linkTestToken() } : {}) },
      });
    } catch (e) {
      const err = (e as Error).name === 'TimeoutError' ? `No answer within ${TIMEOUT_MS / 1000} s` : 'Could not connect';
      hops.push({ url, status: null, ms: Math.round(performance.now() - h0), appMs: null, via, error: err });
      break;
    }
    const ms = Math.round(performance.now() - h0);
    const app = res.headers.get('server-timing')?.match(/app;dur=([\d.]+)/);
    hops.push({ url, status: res.status, ms, appMs: app ? Number(app[1]) : null, via });

    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => {});
      url = new URL(loc, url).toString();
      via = `${res.status} redirect`;
      continue;
    }
    if (res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html')) {
      const html = (await res.text().catch(() => '')).slice(0, 65_536);
      const next = metaRefresh(html, url);
      if (next) { url = next; via = 'meta refresh'; continue; }
      if (/location\.(href|replace|assign)|window\.location\s*=/.test(html)) {
        note = 'The last page may also redirect with JavaScript, which this test cannot follow.';
      }
    } else {
      await res.body?.cancel().catch(() => {});
    }
    break;
  }
  if (hops.length === MAX_HOPS && !hops[hops.length - 1].error) note = `Stopped after ${MAX_HOPS} hops.`;

  const clickId = hops.map((h) => clickIdIn(new URL(h.url))).find(Boolean) ?? null;
  const carried = clickId
    ? hops.map((h, i) => ({ hop: i, params: [...new URL(h.url).searchParams].filter(([, v]) => v.toLowerCase() === clickId).map(([k]) => k) }))
      .filter((c) => c.params.length)
    : [];
  return { hops, totalMs: Math.round(performance.now() - t0), clickId, carried, note };
}
