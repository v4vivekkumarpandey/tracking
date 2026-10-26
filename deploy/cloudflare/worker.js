// Cloudflare Worker for custom tracking domains (Cloudflare for SaaS).
//
// Publishers and advertisers point track.theirsite.com (CNAME) at our zone.
// Cloudflare terminates SSL for that hostname and runs this Worker, which
// forwards tracking requests to the app and tells it, in signed headers, which
// domain was used and who the visitor is.
//
// Worker variables (Settings > Variables):
//   ORIGIN        https://trk.ossaward.org   (the app; DNS-only record)
//   PROXY_SECRET  same long random value as PROXY_SECRET in the app
//
// Route: */* on the ossaward.org zone. Requests for ossaward.org itself are
// passed through untouched (see OWN_ZONE).

const TRACKING_PATHS = /^\/([cs]\/[A-Za-z0-9]{1,32}\/?$|postback\/?$|px\/?$|healthz$)/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = new URL(env.ORIGIN);
    const ownZone = origin.hostname.split('.').slice(-2).join('.');

    // Our own hostnames are not custom domains: let them through as normal.
    if (url.hostname === ownZone || url.hostname.endsWith(`.${ownZone}`)) {
      return fetch(request);
    }

    if (url.pathname === '/' || !TRACKING_PATHS.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers(request.headers);
    headers.delete('cookie'); // never forward cookies from customer domains
    headers.set('X-Tracking-Host', url.hostname);
    headers.set('X-Tracking-Key', env.PROXY_SECRET);
    headers.set('X-Visitor-IP', request.headers.get('CF-Connecting-IP') ?? '');
    headers.set('X-Visitor-Country', request.cf?.country ?? '');

    const target = new URL(url.pathname + url.search, origin);
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual', // pass our 302 to the visitor; don't follow it here
    });

    const out = new Response(res.body, res);
    out.headers.delete('set-cookie');
    return out;
  },
};
