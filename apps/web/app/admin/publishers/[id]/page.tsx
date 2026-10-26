import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, trackingBase } from '@/lib/format';
import { addPostback, deletePostback, setPublisherStatus } from '../../actions';

export default async function PublisherPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const pid = Number(params.id);
  if (!Number.isInteger(pid)) notFound();
  const [p] = await q<{ id: string; name: string; email: string | null; status: string; kyc_status: string }>(
    `SELECT id, name, email, status, kyc_status FROM publishers WHERE id = $1`, [pid],
  );
  if (!p) notFound();

  const postbacks = await q<{ id: string; url: string; offer_name: string | null; goal: string | null }>(
    `SELECT pb.id, pb.url, o.name AS offer_name, pb.goal FROM publisher_postbacks pb
     LEFT JOIN offers o ON o.id = pb.offer_id
     WHERE pb.publisher_id = $1 AND pb.active ORDER BY pb.id`, [pid],
  );
  const links = await q<{ code: string; offer_id: string; offer_name: string; access: string | null }>(
    `SELECT l.code, l.offer_id, o.name AS offer_name, a.status AS access FROM tracking_links l
     JOIN offers o ON o.id = l.offer_id
     LEFT JOIN publisher_offer_access a ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id
     WHERE l.publisher_id = $1 ORDER BY l.id`, [pid],
  );
  const offers = await q<{ id: string; name: string }>(`SELECT id, name FROM offers WHERE status <> 'archived' ORDER BY name`);
  const deliveries = await q<{ url: string; status_code: number | null; error: string | null; created_at: string }>(
    `SELECT d.url, d.status_code, d.error, d.created_at FROM postback_deliveries d
     JOIN conversions c ON c.id = d.conversion_id
     WHERE c.publisher_id = $1 ORDER BY d.id DESC LIMIT 20`, [pid],
  );

  return (
    <>
      <h1>{p.name} <span className={`badge ${p.status}`}>{p.status}</span></h1>
      <div className="card row">
        <span className="muted">{p.email} · KYC {p.kyc_status}</span>
        {(['active', 'blocked'] as const).filter((s) => s !== p.status).map((s) => (
          <form key={s} action={setPublisherStatus} className="inline">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="status" value={s} />
            <button className={s === 'blocked' ? 'danger small' : 'small'}>{s === 'blocked' ? 'Block' : 'Activate'}</button>
          </form>
        ))}
      </div>

      <div className="card">
        <h2>Tracking links</h2>
        <table>
          <tbody>
            {links.map((l) => (
              <tr key={l.code}>
                <td><Link href={`/admin/offers/${l.offer_id}`}>{l.offer_name}</Link></td>
                <td><code>{trackingBase()}/c/{l.code}?sub1=</code></td>
                <td><span className={`badge ${l.access ?? 'pending'}`}>{l.access ?? 'no access'}</span></td>
              </tr>
            ))}
            {links.length === 0 && <tr><td className="muted">Approve this publisher on an offer to create a link.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Postbacks to publisher</h2>
        <p className="muted">
          Macros: <code>{'{click_id} {sub1}…{sub5} {payout} {amount} {goal} {txn_id} {offer_id} {conversion_id} {status}'}</code>.
          Publishers usually pass their own click ID in <code>sub1</code> and get it back via <code>{'{sub1}'}</code>.
        </p>
        <table>
          <tbody>
            {postbacks.map((pb) => (
              <tr key={pb.id}>
                <td><code>{pb.url}</code></td>
                <td>{pb.offer_name ?? 'All offers'}{pb.goal ? ` · goal ${pb.goal}` : ''}</td>
                <td>
                  <form action={deletePostback} className="inline">
                    <input type="hidden" name="id" value={pb.id} />
                    <input type="hidden" name="publisher_id" value={p.id} />
                    <button className="danger small">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addPostback} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="publisher_id" value={p.id} />
          <label style={{ flex: 1, minWidth: 260 }}>URL<input name="url" required placeholder="https://publisher.example/pb?cid={sub1}&amount={payout}" /></label>
          <label>Offer
            <select name="offer_id" defaultValue="">
              <option value="">All offers</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label>Goal<input name="goal" placeholder="all" /></label>
          <button type="submit">Add postback</button>
        </form>
      </div>

      <div className="card table-wrap">
        <h2>Recent postback deliveries</h2>
        <table>
          <thead><tr><th>When</th><th>Result</th><th>URL</th></tr></thead>
          <tbody>
            {deliveries.map((d, i) => (
              <tr key={i}>
                <td>{dateTime(d.created_at)}</td>
                <td className={d.error || (d.status_code ?? 0) >= 300 ? 'error' : ''}>{d.status_code ?? d.error}</td>
                <td><code>{d.url}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
