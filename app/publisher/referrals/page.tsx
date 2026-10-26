import { requirePublisher } from '@/lib/auth';
import { referralsOf } from '@/lib/balance';
import { exec, q } from '@/lib/db';
import { dateTime, money, trackingBase } from '@/lib/format';
import { randomBytes } from 'node:crypto';

export default async function Referrals() {
  const me = await requirePublisher();
  let [p] = await q<{ referral_code: string | null }>(`SELECT referral_code FROM publishers WHERE id = ?`, [me.publisherId]);
  if (!p.referral_code) {
    // Accounts created before referrals existed get a code on first visit.
    const code = randomBytes(8).toString('hex').slice(0, 10);
    await exec(`UPDATE publishers SET referral_code = ? WHERE id = ? AND referral_code IS NULL`, [code, me.publisherId]);
    [p] = await q<{ referral_code: string | null }>(`SELECT referral_code FROM publishers WHERE id = ?`, [me.publisherId]);
  }
  const { pct, months, rows } = await referralsOf(me.publisherId);
  const link = `${trackingBase()}/signup/publisher?ref=${p.referral_code}`;
  const earned = rows.reduce((s, r) => s + r.commission, 0);
  const pending = rows.reduce((s, r) => s + r.pendingCommission, 0);

  return (
    <>
      <div className="crumb">Account</div>
      <h1>Referrals</h1>
      {pct > 0 ? (
        <div className="card stack">
          <p>
            Invite other publishers and earn <strong>{pct}%</strong> of their approved earnings for <strong>{months} months</strong> after they join.
            It&apos;s paid by us on top of their earnings, never taken from them, and added to your balance automatically.
          </p>
          <div className="copy-row"><code className="link-out">{link}</code></div>
        </div>
      ) : (
        <div className="card muted">The referral program is currently paused.</div>
      )}
      <div className="kpis">
        <div className="stat"><div className="label">Publishers referred</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">Commission earned (approved)</div><div className="value">{money(earned)}</div></div>
        <div className="stat"><div className="label">Commission pending</div><div className="value">{money(pending)}</div></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Publisher</th><th>Joined</th><th>Status</th><th>Earning until</th><th className="num">Your commission</th><th className="num">Pending</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name.split(' ')[0]} <span className="muted">#{r.id}</span></td>
                <td>{dateTime(r.joined)}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{r.endsAt.toISOString().slice(0, 10)}</td>
                <td className="num">{money(r.commission)}</td>
                <td className="num muted">{money(r.pendingCommission)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Nobody has joined with your link yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
