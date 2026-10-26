// Small in-memory fixed-window rate limiter. Per process, which is enough to
// slow down password guessing and sign-up spam on a single shared-hosting app.
const hits = new Map<string, { count: number; reset: number }>();

/** Returns true if the action is allowed, and counts it. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 50_000) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  h.count++;
  return h.count <= max;
}

export function clear(key: string) {
  hits.delete(key);
}
