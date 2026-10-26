export const dynamic = 'force-static';

// First-party conversion tag for advertiser sites. On the landing page it
// saves our click ID (from the URL) in a cookie on the advertiser's own
// domain, so it survives browsers that block third-party cookies. On the
// thank-you page, trk('conversion', {...}) fires /px with the saved ID.
//
//   <script src="https://TRACKING_DOMAIN/t.js"></script>
//   <script>trk('conversion', { txn_id: 'ORDER_ID', amount: '49.90' });</script>
//
// data-param="cid" on the script tag adds another URL parameter name to read;
// data-days="30" sets how long the ID is kept (default 30 days).
const SCRIPT = `(function (w, d) {
  var me = d.currentScript, base = me ? new URL(me.src).origin : '';
  var names = ['click_id', 'cid', 'clickid'], K = '_trk_cid';
  var extra = me && me.getAttribute('data-param'); if (extra) names.unshift(extra);
  var days = Math.min(400, Math.max(1, parseInt(me && me.getAttribute('data-days'), 10) || 30));
  var ok = function (v) { return typeof v === 'string' && /^[a-z2-7]{40,80}$/i.test(v); };
  function save(v) {
    d.cookie = K + '=' + v + '; Max-Age=' + days * 86400 + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    try { w.localStorage.setItem(K, v); } catch (e) {}
  }
  function load() {
    var m = d.cookie.match(/(?:^|; )_trk_cid=([a-z2-7]+)/i);
    if (m) return m[1];
    try { var v = w.localStorage.getItem(K); return ok(v) ? v : null; } catch (e) { return null; }
  }
  var q = new URLSearchParams(location.search);
  for (var i = 0; i < names.length; i++) { var v = q.get(names[i]); if (ok(v)) { save(v); break; } }
  function trk(ev, o) {
    if (ev !== 'conversion') return false;
    o = o || {};
    var c = ok(o.click_id) ? o.click_id : load();
    if (!c || !base) return false;
    var u = base + '/px?click_id=' + encodeURIComponent(c);
    ['goal', 'amount', 'txn_id'].forEach(function (k) { if (o[k] != null && o[k] !== '') u += '&' + k + '=' + encodeURIComponent(o[k]); });
    new Image(1, 1).src = u;
    return true;
  }
  var queued = w.trk && w.trk.q; w.trk = trk;
  if (queued) for (var j = 0; j < queued.length; j++) trk.apply(null, queued[j]);
})(window, document);
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
