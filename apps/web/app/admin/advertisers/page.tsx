import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { createAdvertiser } from '../actions';

type Advertiser = {
  id: string; name: string; company: string | null; email: string | null;
  postback_secret: string; status: string; created_at: string; offers: number;
};

export default async function Advertisers() {
  await requireAdmin();
  const rows = await q<Advertiser>(
    `SELECT a.*, (SELECT count(*) FROM offers o WHERE o.advertiser_id = a.id)::int AS offers
     FROM advertisers a ORDER BY a.id DESC`,
  );
  return (
    <>
      <h1>Advertisers</h1>
      <form action={createAdvertiser} className="card row">
        <label>Name<input name="name" required /></label>
        <label>Company<input name="company" /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>GSTIN<input name="gstin" /></label>
        <button type="submit">Add advertiser</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Postback secret</th><th>Status</th><th className="num">Offers</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.name}<div className="muted">{a.company}</div></td>
                <td>{a.email}</td>
                <td><code>{a.postback_secret}</code></td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td className="num">{a.offers}</td>
                <td>{dateTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
