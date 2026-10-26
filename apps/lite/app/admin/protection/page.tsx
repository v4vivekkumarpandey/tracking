import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, dateTime } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '../../_components/ActionForm';
import { addIpBlock, quickBlock, removeIpBlock, saveSettingsAction } from '../actions';

export default async function Protection() {
  await requireAdmin();
  const [s, blocks, networks, topIps, [blocked]] = await Promise.all([
    getSettings(),
    q<{ id: number; rule: string; note: string | null; created_by: string; created_at: Date }>(
      `SELECT id, rule, note, created_by, created_at FROM ip_blocks ORDER BY id DESC`,
    ),
    q<{ asn: number; asn_org: string; clicks: number; publishers: number; conv: number }>(
      `SELECT c.asn, MAX(c.asn_org) AS asn_org, COUNT(*) AS clicks, COUNT(DISTINCT c.publisher_id) AS publishers,
              SUM(EXISTS (SELECT 1 FROM conversions cv WHERE cv.click_id = c.click_id)) AS conv
       FROM clicks c WHERE c.ts >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND c.ip_type = 'datacenter' AND c.asn IS NOT NULL
       GROUP BY c.asn ORDER BY clicks DESC LIMIT 15`,
    ),
    q<{ ip: string; asn_org: string; clicks: number; offers: number; publishers: number }>(
      `SELECT c.ip, MAX(c.asn_org) AS asn_org, COUNT(*) AS clicks, COUNT(DISTINCT c.offer_id) AS offers, COUNT(DISTINCT c.publisher_id) AS publishers
       FROM clicks c WHERE c.ts >= UTC_TIMESTAMP() - INTERVAL 1 DAY AND c.ip <> '' AND c.redirect_reason IS NULL
       GROUP BY c.ip HAVING clicks >= 5 ORDER BY clicks DESC LIMIT 10`,
    ),
    q<{ n: number }>(`SELECT COUNT(*) AS n FROM clicks WHERE ts >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND redirect_reason IN ('ip', 'dc')`),
  ]);

  return (
    <>
      <div className="crumb">Manage</div>
      <h1>Traffic protection</h1>
      <p className="muted">
        {count(blocked.n)} clicks blocked in the last 7 days. <Link href="/admin/clicks?flag=blocked">See them in the click log →</Link>
      </p>

      <ActionForm action={saveSettingsAction} submit="Save">
        <h2>Data-center &amp; VPN traffic</h2>
        <p className="muted">
          Clicks from hosting providers, cloud servers and commercial VPNs (AWS, Google Cloud, DigitalOcean, OVH, NordVPN…) are
          recognised by their network. Real shoppers rarely use them; bots and fake traffic often do. iCloud Private Relay and
          Cloudflare WARP users count as normal visitors.
        </p>
        <label className="check"><input type="radio" name="datacenter_traffic" value="flag" defaultChecked={s.datacenter_traffic !== 'block'} />
          {' '}Allow, but flag: the click counts as flagged and its conversions get +40 fraud score</label>
        <label className="check"><input type="radio" name="datacenter_traffic" value="block" defaultChecked={s.datacenter_traffic === 'block'} />
          {' '}Block: never send these visitors to offers (they get the offer&apos;s fallback URL, or a 404)</label>
      </ActionForm>

      <div className="grid2">
        <ActionForm action={addIpBlock} submit="Block" reset>
          <h2>Block an IP, range or network</h2>
          <label>IP, range or ASN<input name="rule" required maxLength={50} placeholder="203.0.113.7 · 203.0.113.0/24 · AS14061" /></label>
          <label>Note (optional)<input name="note" maxLength={200} placeholder="Click flood from publisher X" /></label>
          <p className="muted">Blocked visitors never reach any offer. The click is still logged, as &quot;IP blocked&quot;.</p>
        </ActionForm>

        <section className="card table-wrap">
          <h2>Blocklist</h2>
          <table>
            <thead><tr><th>Rule</th><th>Note</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id}>
                  <td><code>{b.rule}</code></td>
                  <td className="wrap">{b.note ?? <span className="muted">–</span>}</td>
                  <td>{dateTime(b.created_at)}</td>
                  <td>
                    <form action={removeIpBlock} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <button className="secondary small">Unblock</button>
                    </form>
                  </td>
                </tr>
              ))}
              {blocks.length === 0 && <tr><td colSpan={4} className="muted">Nothing blocked yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card table-wrap">
        <h2>Data-center networks sending clicks (last 7 days)</h2>
        <table>
          <thead><tr><th>Network</th><th className="num">Clicks</th><th className="num">Publishers</th><th className="num">Converted</th><th></th></tr></thead>
          <tbody>
            {networks.map((n) => (
              <tr key={n.asn}>
                <td><Link href={`/admin/clicks?q=AS${n.asn}&days=7`}>{n.asn_org || 'Unknown'}</Link> <span className="muted">AS{n.asn}</span></td>
                <td className="num">{count(n.clicks)}</td>
                <td className="num">{n.publishers}</td>
                <td className="num">{Number(n.conv) || '–'}</td>
                <td>
                  <form action={quickBlock} className="inline">
                    <input type="hidden" name="rule" value={`AS${n.asn}`} />
                    <input type="hidden" name="note" value={n.asn_org} />
                    <button className="danger small">Block network</button>
                  </form>
                </td>
              </tr>
            ))}
            {networks.length === 0 && <tr><td colSpan={5} className="muted">No data-center traffic in the last 7 days.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h2>Busiest IPs (last 24 hours, 5+ clicks)</h2>
        <p className="muted">One IP clicking many times is usually a bot or a click farm. Office and mobile networks can share one IP, so check before blocking.</p>
        <table>
          <thead><tr><th>IP</th><th>Network</th><th className="num">Clicks</th><th className="num">Offers</th><th className="num">Publishers</th><th></th></tr></thead>
          <tbody>
            {topIps.map((r) => (
              <tr key={r.ip}>
                <td><Link href={`/admin/clicks?q=${encodeURIComponent(r.ip)}&days=1`} className="mono">{r.ip}</Link></td>
                <td>{r.asn_org || <span className="muted">unknown</span>}</td>
                <td className="num">{count(r.clicks)}</td>
                <td className="num">{r.offers}</td>
                <td className="num">{r.publishers}</td>
                <td>
                  <form action={quickBlock} className="inline">
                    <input type="hidden" name="rule" value={r.ip} />
                    <input type="hidden" name="note" value={`${r.clicks} clicks in 24h`} />
                    <button className="danger small">Block IP</button>
                  </form>
                </td>
              </tr>
            ))}
            {topIps.length === 0 && <tr><td colSpan={6} className="muted">No IP sent 5 or more clicks in the last 24 hours.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
