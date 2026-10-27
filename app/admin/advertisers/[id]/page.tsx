import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, dateTime, money, trackingBase } from '@/lib/format';
import { setAdvertiserStatus, updateAdvertiser } from '../../actions';
import { ActionForm } from '../../../_components/ActionForm';
import { ResetLogin } from '../../ResetLogin';
import { SetPassword } from '../../SetPassword';
import { AdvertiserFields, type AdvertiserInfo } from '../AdvertiserFields';

type Adv = AdvertiserInfo & {
  id: number; status: string; postback_secret: string; created_at: Date; login: string | null; last_login_at: Date | null;
};

export default async function AdvertiserPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const aid = Number((await props.params).id);
  if (!Number.isInteger(aid)) notFound();
  const created = (await props.searchParams).created === '1';
  const [a] = await q<Adv>(
    `SELECT a.*, u.email AS login, u.last_login_at FROM advertisers a LEFT JOIN users u ON u.advertiser_id = a.id WHERE a.id = ?`, [aid],
  );
  if (!a) notFound();

  const [offers, managers] = await Promise.all([
    q<{ id: number; name: string; status: string; payout_model: string; clicks: string; conversions: string; revenue: string }>(
      `SELECT o.id, o.name, o.status, o.payout_model,
              (SELECT COALESCE(SUM(s.clicks), 0) FROM stats_hourly s WHERE s.offer_id = o.id AND s.hour >= UTC_DATE() - INTERVAL 30 DAY) AS clicks,
              (SELECT COUNT(*) FROM conversions c WHERE c.offer_id = o.id AND c.status <> 'rejected' AND c.created_at >= UTC_DATE() - INTERVAL 30 DAY) AS conversions,
              (SELECT COALESCE(SUM(c.revenue), 0) FROM conversions c WHERE c.offer_id = o.id AND c.status <> 'rejected' AND c.created_at >= UTC_DATE() - INTERVAL 30 DAY) AS revenue
       FROM offers o WHERE o.advertiser_id = ? ORDER BY o.status = 'archived', o.id DESC`, [aid],
    ),
    q<{ m: string }>(`SELECT DISTINCT account_manager AS m FROM advertisers WHERE account_manager IS NOT NULL ORDER BY m`),
  ]);
  const s2s = `${trackingBase()}/postback?click_id={CLICK_ID}&secret=${a.postback_secret}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}`;

  return (
    <>
      <div className="crumb"><Link href="/admin/advertisers">Manage advertisers</Link> ›</div>
      <h1>{a.name} <span className={`badge ${a.status}`}>{a.status}</span></h1>
      {created && <p className="notice" style={{ marginBottom: 12 }}>Advertiser created.{a.login ? ` They sign in with ${a.login}.` : ''}</p>}

      <div className="card stack">
        <div className="row">
          {(['active', 'paused'] as const).filter((s) => s !== a.status).map((s) => (
            <form key={s} action={setAdvertiserStatus} className="inline">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={s} />
              <button className={s === 'paused' ? 'secondary small' : 'small'}>{s === 'paused' ? 'Pause' : a.status === 'pending' ? 'Approve' : 'Activate'}</button>
            </form>
          ))}
          <ResetLogin role="advertiser" id={a.id} hasLogin={!!a.login} />
          <SetPassword role="advertiser" id={a.id} />
        </div>
        <dl className="facts">
          <dt>ID</dt><dd>{a.id}</dd>
          <dt>Login</dt><dd>{a.login ?? <span className="muted">none</span>}{a.last_login_at && <span className="muted"> · last sign-in {dateTime(a.last_login_at)}</span>}</dd>
          <dt>Email</dt><dd>{a.email ?? '–'}</dd>
          <dt>Company</dt><dd>{a.company ?? '–'}{a.tax_id && <span className="muted"> · tax ID {a.tax_id}</span>}</dd>
          <dt>Website</dt><dd>{a.website ? <a href={a.website} target="_blank" rel="noreferrer noopener">{a.website}</a> : '–'}</dd>
          <dt>Account manager</dt><dd>{a.account_manager ?? '–'}</dd>
          <dt>Reference ID</dt><dd className="mono">{a.reference_id ?? '–'}</dd>
          <dt>Created</dt><dd>{dateTime(a.created_at)}</dd>
          {a.notes && <><dt>Notes</dt><dd className="notes">{a.notes}</dd></>}
        </dl>
      </div>

      <details className="card edit-offer">
        <summary><strong>Edit details</strong> <span className="muted">name, email, manager, reference ID, notes</span></summary>
        <ActionForm action={updateAdvertiser} submit="Save advertiser">
          <input type="hidden" name="id" value={a.id} />
          <AdvertiserFields a={a} managers={managers.map((r) => r.m)} extra={
            a.login ? <label>Sign-in email<input name="login_email" type="email" defaultValue={a.login} maxLength={200} /></label> : null
          } />
        </ActionForm>
      </details>

      <div className="card table-wrap">
        <div className="title-row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Offers</h2>
          <Link href="/admin/offers/new" className="button secondary-button">+ New offer</Link>
        </div>
        <table>
          <thead>
            <tr><th>ID</th><th>Offer</th><th>Model</th><th className="num">Clicks 30d</th><th className="num">Conv. 30d</th><th className="num">Revenue 30d</th><th>Status</th></tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td><Link href={`/admin/offers/${o.id}`}>{o.name}</Link></td>
                <td>{o.payout_model}</td>
                <td className="num">{count(o.clicks)}</td>
                <td className="num">{count(o.conversions)}</td>
                <td className="num">{money(o.revenue)}</td>
                <td><span className={`badge ${o.status}`}>{o.status}</span></td>
              </tr>
            ))}
            {offers.length === 0 && <tr><td colSpan={7} className="muted">No offers yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <h2>Conversion tracking</h2>
        <p className="muted">The advertiser calls this from their server when a sale happens. They also see it under Integration in their panel.</p>
        <code className="link-out">{s2s}</code>
        <p className="muted small">Postback secret: <code>{a.postback_secret}</code></p>
      </div>
    </>
  );
}
