import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { disablePostback } from '../actions';
import { AddPostback, TestPostback } from './forms';

export default async function PublisherPostbacks() {
  const me = await requirePublisher();
  const [postbacks, offers, deliveries] = await Promise.all([
    q<{ id: number; url: string; offer: string | null; goal: string | null }>(
      `SELECT pb.id, pb.url, o.name AS offer, pb.goal FROM publisher_postbacks pb LEFT JOIN offers o ON o.id = pb.offer_id
       WHERE pb.publisher_id = ? AND pb.active = 1 ORDER BY pb.id`, [me.publisherId],
    ),
    q<{ id: number; name: string }>(
      `SELECT o.id, o.name FROM offers o JOIN publisher_offer_access a ON a.offer_id = o.id
       WHERE a.publisher_id = ? AND a.status = 'approved' ORDER BY o.name`, [me.publisherId],
    ),
    q<{ id: number; url: string; status_code: number | null; error: string | null; created_at: Date }>(
      `SELECT d.id, d.url, d.status_code, d.error, d.created_at FROM postback_deliveries d
       JOIN conversions c ON c.id = d.conversion_id WHERE c.publisher_id = ? ORDER BY d.id DESC LIMIT 30`, [me.publisherId],
    ),
  ]);

  return (
    <>
      <div className="crumb">Offers</div>
      <h1>Postbacks</h1>
      <div className="card stack">
        <p>
          We call your URL on every conversion so your own tracker or ad platform records it.
          Available macros: <code>{'{sub1} … {sub5} {payout} {goal} {conversion_id} {offer_id} {status} {click_id}'}</code>
        </p>
        <p className="muted">Example: <code>{'https://your-tracker.com/postback?cid={sub1}&payout={payout}'}</code> — send your own click ID as sub1 on the tracking link.</p>
        <table>
          <thead><tr><th>URL</th><th>Applies to</th><th></th></tr></thead>
          <tbody>
            {postbacks.map((pb) => (
              <tr key={pb.id}>
                <td><code>{pb.url}</code></td>
                <td>{pb.offer ?? 'All offers'}{pb.goal ? ` · event ${pb.goal}` : ''}</td>
                <td className="actions">
                  <TestPostback id={pb.id} />
                  <form action={disablePostback} className="inline">
                    <input type="hidden" name="id" value={pb.id} />
                    <button className="danger small">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {postbacks.length === 0 && <tr><td colSpan={3} className="muted">No postbacks yet.</td></tr>}
          </tbody>
        </table>
        <AddPostback offers={offers} />
      </div>

      <div className="card table-wrap">
        <h2>Recent deliveries</h2>
        <table>
          <thead><tr><th>When</th><th>Result</th><th>URL</th></tr></thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>{dateTime(d.created_at)}</td>
                <td className={d.error || (d.status_code ?? 0) >= 300 ? 'error' : ''}>{d.status_code ?? d.error}</td>
                <td><code>{d.url}</code></td>
              </tr>
            ))}
            {deliveries.length === 0 && <tr><td colSpan={3} className="muted">Nothing sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
