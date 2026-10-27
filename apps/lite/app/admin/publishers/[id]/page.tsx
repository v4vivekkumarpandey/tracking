import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { balances, paymentHistory } from '@/lib/balance';
import { dateTime, money, trackingBase } from '@/lib/format';
import { addPaymentMethodAdmin, addPostback, deletePostback, removePaymentMethodAdmin, setDefaultPaymentMethodAdmin, setPublisherStatus, updatePublisherProfile } from '../../actions';
import { RecordPayment } from '../../RecordPayment';
import { SourceBreakdown } from '../../../_components/SourceBreakdown';
import { ResetLogin } from '../../ResetLogin';
import { SetPassword } from '../../SetPassword';
import { ActionForm } from '../../../_components/ActionForm';
import { PaymentMethods } from '../../../_components/PaymentMethods';
import { ProfileFields } from '../../../_components/ProfileFields';
import { methodLabel, methodsOf } from '@/lib/paymentMethods';

type Pub = {
  id: number; name: string; company: string | null; email: string | null; country: string | null; website: string | null;
  traffic_sources: string | null; tax_id: string | null; payout_method: string | null; payout_details: string | null;
  status: string; kyc_status: string; created_at: Date; login: string | null; last_login_at: Date | null;
  referred_by: number | null; referrer: string | null;
  phone: string | null; messenger: string | null; address: string | null; payment_changed_at: Date | null;
};

export default async function PublisherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const pid = Number((await params).id);
  if (!Number.isInteger(pid)) notFound();
  const [p] = await q<Pub>(
    `SELECT p.*, u.email AS login, u.last_login_at, r.name AS referrer FROM publishers p
     LEFT JOIN users u ON u.publisher_id = p.id LEFT JOIN publishers r ON r.id = p.referred_by WHERE p.id = ?`, [pid],
  );
  if (!p) notFound();

  const [postbacks, links, offers, deliveries, [bal], history, methods] = await Promise.all([
    q<{ id: number; url: string; offer_name: string | null; goal: string | null }>(
      `SELECT pb.id, pb.url, o.name AS offer_name, pb.goal FROM publisher_postbacks pb
       LEFT JOIN offers o ON o.id = pb.offer_id
       WHERE pb.publisher_id = ? AND pb.active = 1 ORDER BY pb.id`, [pid],
    ),
    q<{ code: string; offer_id: number; offer_name: string; access: string | null }>(
      `SELECT l.code, l.offer_id, o.name AS offer_name, a.status AS access FROM tracking_links l
       JOIN offers o ON o.id = l.offer_id
       LEFT JOIN publisher_offer_access a ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id
       WHERE l.publisher_id = ? ORDER BY l.id`, [pid],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM offers WHERE status <> 'archived' ORDER BY name`),
    q<{ id: number; url: string; status_code: number | null; error: string | null; created_at: Date }>(
      `SELECT d.id, d.url, d.status_code, d.error, d.created_at FROM postback_deliveries d
       JOIN conversions c ON c.id = d.conversion_id
       WHERE c.publisher_id = ? ORDER BY d.id DESC LIMIT 20`, [pid],
    ),
    balances(pid),
    paymentHistory(pid),
    methodsOf(pid),
  ]);

  return (
    <>
      <div className="crumb"><Link href="/admin/publishers">Publishers</Link></div>
      <h1>{p.name} <span className={`badge ${p.status}`}>{p.status}</span></h1>
      <div className="card stack">
        <div className="row">
          {(['active', 'blocked'] as const).filter((s) => s !== p.status).map((s) => (
            <form key={s} action={setPublisherStatus} className="inline">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value={s} />
              <button className={s === 'blocked' ? 'danger small' : 'small'}>{s === 'blocked' ? 'Block' : p.status === 'pending' ? 'Approve' : 'Activate'}</button>
            </form>
          ))}
          <ResetLogin role="publisher" id={p.id} hasLogin={!!p.login} />
          <SetPassword role="publisher" id={p.id} />
        </div>
        <dl className="facts">
          <dt>Login</dt><dd>{p.login ?? <span className="muted">none</span>}{p.last_login_at && <span className="muted"> · last sign-in {dateTime(p.last_login_at)}</span>}</dd>
          <dt>Contact</dt><dd>{[p.company, p.email, p.phone, p.messenger, p.country].filter(Boolean).join(' · ') || '–'}</dd>
          {p.address && <><dt>Address</dt><dd className="wrap">{p.address}</dd></>}
          <dt>Website</dt><dd>{p.website ? <a href={p.website} target="_blank" rel="noreferrer noopener">{p.website}</a> : '–'}</dd>
          <dt>Traffic (declared)</dt><dd className="wrap">{p.traffic_sources || '–'}</dd>
          <dt>Payment</dt><dd>{p.payout_method ? <><strong>{methodLabel(p.payout_method)}</strong> <span className="mono">{p.payout_details}</span></> : <span className="muted">not provided</span>}{p.tax_id && <span className="muted"> · tax ID {p.tax_id}</span>}
            {p.payment_changed_at && Date.now() - new Date(p.payment_changed_at).getTime() < 7 * 86_400_000 && <div className="error">Payment details changed {dateTime(p.payment_changed_at)}: confirm with the publisher before paying.</div>}</dd>
          <dt>Joined</dt><dd>{dateTime(p.created_at)}{p.referred_by && <> · referred by <Link href={`/admin/publishers/${p.referred_by}`}>{p.referrer}</Link></>}</dd>
        </dl>
      </div>

      <details className="card edit-offer">
        <summary><strong>Edit profile</strong> <span className="muted">contact details, sign-in email</span></summary>
        <ActionForm action={updatePublisherProfile} submit="Save profile">
          <input type="hidden" name="id" value={p.id} />
          <ProfileFields p={p} />
          {p.login && <label>Sign-in email<input name="login_email" type="email" defaultValue={p.login} maxLength={200} /></label>}
        </ActionForm>
      </details>

      <PaymentMethods methods={methods} add={addPaymentMethodAdmin} setDefault={setDefaultPaymentMethodAdmin}
        remove={removePaymentMethodAdmin} publisherId={p.id} admin />

      <SourceBreakdown filter={{ publisherId: p.id }} title="Detected traffic sources (last 30 days)" />

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
          Macros: <code>{'{click_id} {source_id} {sub1}…{sub10} {payout} {amount} {goal} {txn_id} {offer_id} {conversion_id} {status}'}</code>.
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
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>{dateTime(d.created_at)}</td>
                <td className={d.error || (d.status_code ?? 0) >= 300 ? 'error' : ''}>{d.status_code ?? d.error}</td>
                <td><code>{d.url}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <h2>Payments</h2>
        {bal && (
          <p>
            Approved {money(bal.approved)}{bal.referral > 0 && <> + referral {money(bal.referral)}</>} − paid {money(bal.paid)} = <strong>balance {money(bal.balance)}</strong>
            <span className="muted"> · pending {money(bal.pending)}</span>
          </p>
        )}
        <RecordPayment publisherId={p.id} amount={bal?.balance ?? 0} method={p.payout_method} />
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{dateTime(h.paid_at)}</td><td>{h.method}</td><td className="mono">{h.reference}</td>
                <td className="num">{money(h.amount)}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={4} className="muted">No payments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
