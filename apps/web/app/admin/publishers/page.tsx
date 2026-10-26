import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { createPublisher } from '../actions';

type Publisher = {
  id: string; name: string; company: string | null; email: string | null;
  status: string; kyc_status: string; created_at: string; offers: number;
};

export default async function Publishers() {
  await requireAdmin();
  const rows = await q<Publisher>(
    `SELECT p.*, (SELECT count(*) FROM publisher_offer_access a
                  WHERE a.publisher_id = p.id AND a.status = 'approved')::int AS offers
     FROM publishers p ORDER BY p.id DESC`,
  );
  return (
    <>
      <h1>Publishers</h1>
      <form action={createPublisher} className="card row">
        <label>Name<input name="name" required /></label>
        <label>Company<input name="company" /></label>
        <label>Email<input name="email" type="email" /></label>
        <button type="submit">Add publisher</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Status</th><th>KYC</th><th className="num">Approved offers</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td><Link href={`/admin/publishers/${p.id}`}>{p.name}</Link><div className="muted">{p.company}</div></td>
                <td>{p.email}</td>
                <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                <td><span className={`badge ${p.kyc_status}`}>{p.kyc_status}</span></td>
                <td className="num">{p.offers}</td>
                <td>{dateTime(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
