// Minimal Cloudflare for SaaS client: custom hostnames on our zone.
// Docs: https://developers.cloudflare.com/api/resources/custom_hostnames/

export type CfHostname = {
  id: string;
  hostname: string;
  status: string; // pending | active | moved | deleted | blocked ...
  ssl?: { status?: string; validation_errors?: { message?: string }[] };
  verification_errors?: string[];
};

export class CfError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function cfConfigured(): boolean {
  return !!(process.env.CF_API_TOKEN && process.env.CF_ZONE_ID);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = (process.env.CF_API_BASE ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
  const res = await fetch(`${base}/zones/${process.env.CF_ZONE_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string }[] };
  if (!res.ok || json.success === false) {
    const msg = json.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Cloudflare API returned ${res.status}`;
    throw new CfError(msg, res.status);
  }
  return json.result as T;
}

export function createHostname(hostname: string) {
  return call<CfHostname>('POST', '/custom_hostnames', {
    hostname,
    ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
  });
}

export function getHostname(id: string) {
  return call<CfHostname>('GET', `/custom_hostnames/${encodeURIComponent(id)}`);
}

export async function deleteHostname(id: string) {
  try {
    await call('DELETE', `/custom_hostnames/${encodeURIComponent(id)}`);
  } catch (e) {
    if (!(e instanceof CfError && e.status === 404)) throw e;
  }
}

/** For the admin setup card: can we reach the API with these credentials? */
export async function cfHealth(): Promise<string | null> {
  if (!cfConfigured()) return 'CF_API_TOKEN and CF_ZONE_ID are not set.';
  try {
    await call('GET', '/custom_hostnames?per_page=1');
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
