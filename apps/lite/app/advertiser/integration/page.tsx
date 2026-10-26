import Link from 'next/link';
import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { domainsFor } from '@/lib/domains';
import { dateTime, trackingBase } from '@/lib/format';
import { regenerateSecret } from '../actions';
import { ConfirmButton } from './ConfirmButton';

export default async function Integration(props: { searchParams: Promise<{ domain?: string }> }) {
  const me = await requireAdvertiser();
  const sp = await props.searchParams;
  const [[adv], offers, logs, domains] = await Promise.all([
    q<{ secret: string }>(`SELECT postback_secret AS secret FROM advertisers WHERE id = ?`, [me.advertiserId]),
    q<{ id: number; name: string }>(`SELECT id, name FROM offers WHERE advertiser_id = ? AND status <> 'archived' ORDER BY name`, [me.advertiserId]),
    q<{ id: number; created_at: Date; source: string; status: string; message: string | null; params: string }>(
      `SELECT l.id, l.created_at, l.source, l.status, l.message, l.params FROM postback_log l
       JOIN offers o ON o.id = l.offer_id WHERE o.advertiser_id = ? ORDER BY l.id DESC LIMIT 30`,
      [me.advertiserId],
    ),
    domainsFor({ type: 'advertiser', id: me.advertiserId }),
  ]);
  // Their own active domain makes the pixel first-party; default to it.
  const hosts = [...domains.filter((d) => d.status === 'active').map((d) => d.hostname), new URL(trackingBase()).host];
  const host = hosts.find((h) => h === sp.domain) ?? hosts[0];
  const base = host === new URL(trackingBase()).host ? trackingBase() : `https://${host}`;
  const s2s = `${base}/postback?click_id={CLICK_ID}&secret=${adv.secret}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}`;
  const pixel = `<img src="${base}/px?click_id={CLICK_ID}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}" width="1" height="1" alt="" style="display:none" />`;
  const cookiePixel = `<img src="${base}/px?offer_id=${offers[0]?.id ?? '{OFFER_ID}'}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}" width="1" height="1" alt="" style="display:none" />`;
  const tag = `<script src="${base}/t.js"></script>`;
  const tagConversion = `<script>trk('conversion', { txn_id: '{ORDER_ID}', amount: '{SALE_AMOUNT}' });</script>`;

  return (
    <>
      <div className="crumb">Manage</div>
      <h1>Integration</h1>

      <div className="card row">
        <span>Tracking domain:</span>
        {hosts.length > 1
          ? hosts.map((h) => (
              <Link key={h} href={`/advertiser/integration?domain=${encodeURIComponent(h)}`} className={h === host ? 'badge active' : 'badge'}>{h}</Link>
            ))
          : <><code>{host}</code> <Link href="/advertiser/domains">Use your own domain (first-party) →</Link></>}
      </div>

      <section className="card stack">
        <h2>1. Save our click ID</h2>
        <p>
          Every visitor we send arrives on your landing page with <code>click_id=…</code> in the URL. Save it with the visitor&apos;s
          session or order (cookie, database or hidden form field).
        </p>
      </section>

      <section className="card stack">
        <h2>2. Report conversions (server-to-server, recommended)</h2>
        <p>When an order or sign-up completes, call this URL from your server (GET or POST):</p>
        <code className="link-out">{s2s}</code>
        <table>
          <tbody>
            <tr><td><code>click_id</code></td><td>The value you saved in step 1 (required)</td></tr>
            <tr><td><code>secret</code></td><td>Your private key. Keep it on your server only, never in web pages</td></tr>
            <tr><td><code>txn_id</code></td><td>Your order / lead ID. We use it to ignore duplicate reports</td></tr>
            <tr><td><code>amount</code></td><td>Sale amount, for percentage-based offers (e.g. <code>49.90</code>)</td></tr>
            <tr><td><code>goal</code></td><td>Optional event code, if the offer has several events</td></tr>
          </tbody>
        </table>
        <p className="muted">Responses: <code>{'{"status":"ok"}'}</code> recorded · <code>{'{"status":"duplicate"}'}</code> already recorded · <code>{'{"status":"rejected","error":…}'}</code> check the reason below.</p>
      </section>

      <section className="card stack">
        <h2>No developer? JavaScript tag</h2>
        <p>
          Paste this on <strong>every page</strong> of your site (or at least the landing page and the thank-you page). It saves
          our click ID in your own site&apos;s cookie, so you don&apos;t need to store it yourself:
        </p>
        <code className="link-out">{tag}</code>
        <p>Then, on the <strong>thank-you page only</strong>, below that line, report the conversion:</p>
        <code className="link-out">{tagConversion}</code>
        <p className="muted">
          If your landing page URL passes our ID under another name (e.g. <code>?cid=</code>), add <code>data-param=&quot;cid&quot;</code> to the
          script tag. Ad blockers can stop browser tags; the server call above can&apos;t be blocked.
        </p>
      </section>

      <section className="card stack">
        <h2>Alternative: browser pixel</h2>
        <p className="muted">Use only if a server call isn&apos;t possible. Place it on the thank-you page; ad blockers can stop it.</p>
        <code className="link-out">{pixel}</code>
        <p>Can&apos;t get the click ID onto the thank-you page at all? Use the offer ID instead and we match the visitor by our cookie:</p>
        <code className="link-out">{cookiePixel}</code>
        <p className="muted">
          Works in Chrome and Edge. Safari and Firefox block this cookie unless the pixel is served from your own tracking domain
          (<Link href="/advertiser/domains">Domains</Link>), so prefer the server call or the JavaScript tag.
        </p>
      </section>

      <section className="card stack">
        <h2>Your offers</h2>
        <p className="muted">One secret covers all your offers; the click ID tells us which offer converted.</p>
        <ul>{offers.map((o) => <li key={o.id}>#{o.id} {o.name}</li>)}</ul>
        <div className="row">
          <span className="muted">Secret leaked?</span>
          <ConfirmButton action={regenerateSecret} message="Generate a new secret? Your current integration stops working until you update it on your server.">
            Generate new secret
          </ConfirmButton>
        </div>
      </section>

      <section className="card table-wrap">
        <h2>Recent postbacks we received from you</h2>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Result</th><th>Parameters</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{dateTime(l.created_at)}</td>
                <td>{l.source}</td>
                <td className={l.status === 'rejected' ? 'error' : ''}>{l.status}{l.message ? `: ${l.message}` : ''}</td>
                <td><code>{l.params}</code></td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} className="muted">Nothing received yet. Your first test conversion will show here.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
