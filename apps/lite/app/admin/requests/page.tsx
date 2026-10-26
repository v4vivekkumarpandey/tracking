import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime, money } from '@/lib/format';
import { approvePublisher, rejectAccess, reviewOffer, setAdvertiserStatus, setPublisherStatus } from '../actions';

export default async function Requests() {
  await requireAdmin();
  const [pubs, advs, access, offers] = await Promise.all([
    q<{ id: number; name: string; company: string | null; email: string | null; country: string | null; website: string | null; traffic_sources: string | null; created_at: Date }>(
      `SELECT id, name, company, email, country, website, traffic_sources, created_at FROM publishers WHERE status = 'pending' ORDER BY id`,
    ),
    q<{ id: number; name: string; company: string | null; email: string | null; website: string | null; created_at: Date }>(
      `SELECT id, name, company, email, website, created_at FROM advertisers WHERE status = 'pending' ORDER BY id`,
    ),
    q<{ offer_id: number; offer: string; publisher_id: number; publisher: string; created_at: Date }>(
      `SELECT a.offer_id, o.name AS offer, a.publisher_id, p.name AS publisher, a.created_at
       FROM publisher_offer_access a JOIN offers o ON o.id = a.offer_id JOIN publishers p ON p.id = a.publisher_id
       WHERE a.status = 'pending' ORDER BY a.created_at`,
    ),
    q<{ id: number; name: string; advertiser: string; payout_model: string; default_revenue: string; revenue_percent: string | null; destination_url: string; created_at: Date }>(
      `SELECT o.id, o.name, a.name AS advertiser, o.payout_model, o.default_revenue, o.revenue_percent, o.destination_url, o.created_at
       FROM offers o JOIN advertisers a ON a.id = o.advertiser_id WHERE o.status = 'pending' ORDER BY o.id`,
    ),
  ]);
  const none = pubs.length + advs.length + access.length + offers.length === 0;

  return (
    <>
      <div className="crumb">Approvals</div>
      <h1>Waiting for approval</h1>
      {none && <div className="card muted">Nothing waiting. New sign-ups, offer access requests and submitted offers appear here.</div>}

      {pubs.length > 0 && (
        <section className="card table-wrap">
          <h2>Publisher sign-ups ({pubs.length})</h2>
          <table>
            <thead><tr><th>Publisher</th><th>Website / traffic</th><th>Signed up</th><th></th></tr></thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/admin/publishers/${p.id}`}>{p.name}</Link><div className="muted">{p.company} · {p.email} · {p.country}</div></td>
                  <td className="wrap">{p.website && <div><a href={p.website} target="_blank" rel="noreferrer noopener">{p.website}</a></div>}<div className="muted">{p.traffic_sources}</div></td>
                  <td>{dateTime(p.created_at)}</td>
                  <td className="actions">
                    <Status action={setPublisherStatus} id={p.id} status="active" label="Approve" />
                    <Status action={setPublisherStatus} id={p.id} status="blocked" label="Reject" danger />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {advs.length > 0 && (
        <section className="card table-wrap">
          <h2>Advertiser sign-ups ({advs.length})</h2>
          <table>
            <thead><tr><th>Advertiser</th><th>Website</th><th>Signed up</th><th></th></tr></thead>
            <tbody>
              {advs.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}<div className="muted">{a.company} · {a.email}</div></td>
                  <td>{a.website && <a href={a.website} target="_blank" rel="noreferrer noopener">{a.website}</a>}</td>
                  <td>{dateTime(a.created_at)}</td>
                  <td className="actions">
                    <Status action={setAdvertiserStatus} id={a.id} status="active" label="Approve" />
                    <Status action={setAdvertiserStatus} id={a.id} status="paused" label="Reject" danger />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {access.length > 0 && (
        <section className="card table-wrap">
          <h2>Offer access requests ({access.length})</h2>
          <table>
            <thead><tr><th>Publisher</th><th>Offer</th><th>Requested</th><th></th></tr></thead>
            <tbody>
              {access.map((r) => (
                <tr key={`${r.offer_id}-${r.publisher_id}`}>
                  <td><Link href={`/admin/publishers/${r.publisher_id}`}>{r.publisher}</Link></td>
                  <td><Link href={`/admin/offers/${r.offer_id}`}>{r.offer}</Link></td>
                  <td>{dateTime(r.created_at)}</td>
                  <td className="actions">
                    <form action={approvePublisher} className="inline">
                      <input type="hidden" name="offer_id" value={r.offer_id} />
                      <input type="hidden" name="publisher_id" value={r.publisher_id} />
                      <button className="small">Approve</button>
                    </form>
                    <form action={rejectAccess} className="inline">
                      <input type="hidden" name="offer_id" value={r.offer_id} />
                      <input type="hidden" name="publisher_id" value={r.publisher_id} />
                      <button className="danger small">Reject</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {offers.length > 0 && (
        <section className="card table-wrap">
          <h2>Offers submitted by advertisers ({offers.length})</h2>
          <p className="muted">Set what publishers earn, then approve. Approved offers go live in the publisher marketplace.</p>
          <table>
            <thead><tr><th>Offer</th><th>Advertiser pays</th><th>Publisher payout</th><th></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/offers/${o.id}`}>{o.name}</Link><div className="muted">{o.advertiser} · {o.payout_model}</div><code className="muted">{o.destination_url}</code></td>
                  <td>{o.revenue_percent ? `${o.revenue_percent}% of sale` : money(o.default_revenue)}</td>
                  <td colSpan={2}>
                    <form action={reviewOffer} className="row">
                      <input type="hidden" name="id" value={o.id} />
                      {o.revenue_percent
                        ? <label>Payout %<input name="payout_percent" inputMode="decimal" required style={{ width: 90 }} /></label>
                        : <label>Payout<input name="default_payout" inputMode="decimal" required style={{ width: 90 }} /></label>}
                      <input type="hidden" name="decision" value="approve" />
                      <button className="small">Approve</button>
                    </form>
                    <form action={reviewOffer} className="inline">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <button className="danger small">Reject</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Status({ action, id, status, label, danger }: {
  action: (fd: FormData) => Promise<void>; id: number; status: string; label: string; danger?: boolean;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={danger ? 'danger small' : 'small'}>{label}</button>
    </form>
  );
}
