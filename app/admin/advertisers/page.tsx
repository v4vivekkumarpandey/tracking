import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { createAdvertiser, setAdvertiserStatus } from '../actions';
import { ResetLogin } from '../ResetLogin';
import { SetPassword } from '../SetPassword';

type Advertiser = {
  id: number; name: string; company: string | null; email: string | null; website: string | null;
  postback_secret: string; status: string; created_at: Date; offers: number; login: string | null;
};

export default async function Advertisers() {
  await requireAdmin();
  const rows = await q<Advertiser>(
    `SELECT a.*, (SELECT COUNT(*) FROM offers o WHERE o.advertiser_id = a.id) AS offers,
            (SELECT u.email FROM users u WHERE u.advertiser_id = a.id LIMIT 1) AS login
     FROM advertisers a ORDER BY a.status = 'pending' DESC, a.id DESC`,
  );
  return (
    <>
      <h1>Advertisers</h1>
      <form action={createAdvertiser} className="card row">
        <label>Name<input name="name" required /></label>
        <label>Company<input name="company" /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Tax / VAT ID<input name="tax_id" /></label>
        <button type="submit">Add advertiser</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Login</th><th>Postback secret</th><th>Status</th><th className="num">Offers</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.name}<div className="muted">{a.company}</div>{a.website && <div className="muted">{a.website}</div>}</td>
                <td>
                  <div>{a.login ?? <span className="muted">{a.email ?? 'no email'}</span>}</div>
                  <ResetLogin role="advertiser" id={a.id} hasLogin={!!a.login} /> <SetPassword role="advertiser" id={a.id} />
                </td>
                <td><code>{a.postback_secret}</code></td>
                <td>
                  <span className={`badge ${a.status}`}>{a.status}</span>
                  <div className="actions">
                    {(['active', 'paused'] as const).filter((s) => s !== a.status).map((s) => (
                      <form key={s} action={setAdvertiserStatus} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className={s === 'active' ? 'small' : 'secondary small'}>{s === 'active' ? 'Activate' : 'Pause'}</button>
                      </form>
                    ))}
                  </div>
                </td>
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
