import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { creativesFor } from '@/lib/creatives';
import { CURRENCY, dateTime, money, trackingBase } from '@/lib/format';
import { CreativesManager } from '../../../_components/CreativesManager';
import { addGoal, approvePublisher, deleteGoal, rejectAccess, reviewOffer, revokePublisher, setOfferStatus, setOfferVisibility } from '../../actions';
import { EditOffer, type EditableOffer } from './EditOffer';

type Offer = EditableOffer & {
  advertiser: string; postback_secret: string; visibility: string; status: string;
};

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const oid = Number((await params).id);
  if (!Number.isInteger(oid)) notFound();
  const [o] = await q<Offer>(
    `SELECT o.*, a.name AS advertiser, a.postback_secret FROM offers o
     JOIN advertisers a ON a.id = o.advertiser_id WHERE o.id = ?`, [oid],
  );
  if (!o) notFound();

  const [goals, access, publishers, history, creatives] = await Promise.all([
    q<{ code: string; name: string; revenue: string | null; payout: string | null }>(
      `SELECT code, name, revenue, payout FROM offer_goals WHERE offer_id = ? ORDER BY code`, [oid],
    ),
    q<{ publisher_id: number; name: string; status: string; payout_override: string | null; code: string | null }>(
      `SELECT a.publisher_id, p.name, a.status, a.payout_override, l.code
       FROM publisher_offer_access a
       JOIN publishers p ON p.id = a.publisher_id
       LEFT JOIN tracking_links l ON l.offer_id = a.offer_id AND l.publisher_id = a.publisher_id
       WHERE a.offer_id = ? ORDER BY p.name`, [oid],
    ),
    q<{ id: number; name: string }>(`SELECT id, name FROM publishers WHERE status = 'active' ORDER BY name`),
    q<{ id: number; actor: string; action: string; details: string | null; created_at: Date }>(
      `SELECT id, actor, action, details, created_at FROM audit_log
       WHERE entity = 'offer' AND entity_id = ? ORDER BY id DESC LIMIT 50`, [oid],
    ),
    creativesFor(oid),
  ]);

  const base = trackingBase();
  const s2s = `${base}/postback?click_id={CLICK_ID}&secret=${o.postback_secret}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}&goal=`;
  const pixel = `<img src="${base}/px?click_id={CLICK_ID}&txn_id={ORDER_ID}&amount={SALE_AMOUNT}" width="1" height="1" alt="" />`;

  return (
    <>
      <h1>{o.name} <span className={`badge ${o.status}`}>{o.status}</span></h1>

      <div className="card stack">
        <div className="row">
          <span>Advertiser: <strong>{o.advertiser}</strong></span>
          <span>Model: <strong>{o.payout_model}</strong></span>
          <span>Revenue: <strong>{o.revenue_percent ? `${o.revenue_percent}% of sale` : money(o.default_revenue)}</strong></span>
          <span>Payout: <strong>{o.payout_percent ? `${o.payout_percent}% of sale` : money(o.default_payout)}</strong></span>
          <span>Attribution: <strong>{o.attribution_days} days</strong></span>
        </div>
        <div>Destination: <code>{o.destination_url}</code></div>
        {o.description && <div className="muted wrap">{o.description}</div>}
        {o.status === 'pending' && (
          <div className="notice">
            <strong>Submitted by the advertiser.</strong> Set the publisher payout and approve to make it live.
            <form action={reviewOffer} className="row" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={o.id} />
              {o.revenue_percent
                ? <label>Payout % of sale<input name="payout_percent" inputMode="decimal" required style={{ width: 100 }} /></label>
                : <label>Payout per conversion ({CURRENCY})<input name="default_payout" inputMode="decimal" required style={{ width: 100 }} /></label>}
              <input type="hidden" name="decision" value="approve" />
              <button className="small">Approve offer</button>
            </form>
          </div>
        )}
        <div className="row">
          <form action={setOfferVisibility} className="inline">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="visibility" value={o.visibility === 'public' ? 'private' : 'public'} />
            <span className={`badge ${o.visibility === 'public' ? 'active' : 'paused'}`}>{o.visibility}</span>{' '}
            <button className="secondary small" title={o.visibility === 'public' ? 'Hide from the publisher marketplace' : 'Show in the publisher marketplace'}>
              {o.visibility === 'public' ? 'Make private' : 'Make public'}
            </button>
          </form>
          {(['active', 'paused', 'archived'] as const).filter((s) => s !== o.status && !(o.status === 'pending' && s === 'active')).map((s) => (
            <form key={s} action={setOfferStatus} className="inline">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="status" value={s} />
              <button className={s === 'active' ? 'small' : 'secondary small'}>
                {s === 'active' ? 'Activate' : s === 'paused' ? 'Pause' : 'Archive'}
              </button>
            </form>
          ))}
        </div>
      </div>

      <EditOffer o={o} />

      <div className="card stack">
        <h2>Give this to the advertiser</h2>
        <p className="muted">
          The advertiser stores our <code>click_id</code> from the landing page URL and calls this when a sale or lead happens.
          Replace the {'{CAPS}'} parts with their own values.
        </p>
        <div>Server-to-server postback (recommended):</div>
        <code>{s2s}</code>
        <div>Browser pixel (fallback, less reliable):</div>
        <code>{pixel}</code>
      </div>

      <div className="card">
        <h2>Publishers</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Publisher</th><th>Status</th><th className="num">Payout override</th><th>Tracking link</th><th></th></tr></thead>
            <tbody>
              {access.map((a) => (
                <tr key={a.publisher_id}>
                  <td><Link href={`/admin/publishers/${a.publisher_id}`}>{a.name}</Link></td>
                  <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                  <td className="num">{a.payout_override ? money(a.payout_override) : '–'}</td>
                  <td>{a.code ? <code>{base}/c/{a.code}?sub1=</code> : '–'}</td>
                  <td className="actions">
                    {a.status !== 'approved' && (
                      <form action={approvePublisher} className="inline">
                        <input type="hidden" name="offer_id" value={o.id} />
                        <input type="hidden" name="publisher_id" value={a.publisher_id} />
                        <button className="small">Approve</button>
                      </form>
                    )}
                    {a.status === 'pending' && (
                      <form action={rejectAccess} className="inline">
                        <input type="hidden" name="offer_id" value={o.id} />
                        <input type="hidden" name="publisher_id" value={a.publisher_id} />
                        <button className="danger small">Reject</button>
                      </form>
                    )}
                    {a.status === 'approved' && (
                      <form action={revokePublisher} className="inline">
                        <input type="hidden" name="offer_id" value={o.id} />
                        <input type="hidden" name="publisher_id" value={a.publisher_id} />
                        <button className="danger small">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={approvePublisher} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="offer_id" value={o.id} />
          <label>Publisher
            <select name="publisher_id" required>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Payout override ({CURRENCY}, optional)<input name="payout_override" inputMode="decimal" /></label>
          <button type="submit">Approve &amp; create link</button>
        </form>
      </div>

      <div className="card">
        <h2>Goals</h2>
        <p className="muted">
          Extra events with their own price, sent as <code>&amp;goal=code</code>. A postback without a goal uses the offer defaults.
        </p>
        <table>
          <thead><tr><th>Code</th><th>Name</th><th className="num">Revenue</th><th className="num">Payout</th><th></th></tr></thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.code}>
                <td><code>{g.code}</code></td>
                <td>{g.name}</td>
                <td className="num">{g.revenue ? money(g.revenue) : 'offer default'}</td>
                <td className="num">{g.payout ? money(g.payout) : 'offer default'}</td>
                <td className="actions">
                  <form action={deleteGoal} className="inline">
                    <input type="hidden" name="offer_id" value={o.id} />
                    <input type="hidden" name="code" value={g.code} />
                    <button className="danger small">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">To change a goal&apos;s price, save it again below with the same code.</p>
        <form action={addGoal} className="row" style={{ marginTop: 12 }}>
          <input type="hidden" name="offer_id" value={o.id} />
          <label>Code<input name="code" required placeholder="lead" /></label>
          <label>Name<input name="name" placeholder="Signup" /></label>
          <label>Revenue ({CURRENCY})<input name="revenue" inputMode="decimal" /></label>
          <label>Payout ({CURRENCY})<input name="payout" inputMode="decimal" /></label>
          <button type="submit">Save goal</button>
        </form>
      </div>

      <CreativesManager offerId={o.id} creatives={creatives} canEdit />

      <div className="card table-wrap">
        <h2>Change history</h2>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{dateTime(h.created_at)}</td>
                <td>{h.actor}</td>
                <td className="wrap"><HistoryText action={h.action} details={h.details} /></td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={3} className="muted">No changes recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HistoryText({ action, details }: { action: string; details: string | null }) {
  let d: Record<string, unknown> = {};
  try { d = details ? JSON.parse(details) : {}; } catch { /* old rows */ }
  if (action === 'edit' && d.changes) {
    const fmt = (v: unknown) => (v === null || v === '' ? '–' : String(v));
    return (
      <>
        {Object.entries(d.changes as Record<string, [unknown, unknown]>).map(([f, [a, b]]) => (
          <div key={f}><code>{f}</code>: {fmt(a)} → <strong>{fmt(b)}</strong></div>
        ))}
      </>
    );
  }
  const extra = Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  return <>{action.replace(/_/g, ' ')}{extra && <span className="muted"> ({extra})</span>}</>;
}
