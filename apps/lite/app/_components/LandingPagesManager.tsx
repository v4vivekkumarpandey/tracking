import type { LandingRow } from '@/lib/landing';
import { count } from '@/lib/format';
import { ActionForm } from './ActionForm';
import { addLandingAdmin, updateLandingAdmin } from '../admin/actions';
import { addLandingAdvertiser, updateLandingAdvertiser } from '../advertiser/actions';

/** Extra landing pages for an offer, with split % (admin or the offer's advertiser). */
export function LandingPagesManager({ offerId, defaultUrl, pages, as }: {
  offerId: number; defaultUrl: string; pages: LandingRow[]; as: 'admin' | 'advertiser';
}) {
  const add = as === 'admin' ? addLandingAdmin : addLandingAdvertiser;
  const update = as === 'admin' ? updateLandingAdmin : updateLandingAdvertiser;
  const active = pages.filter((p) => p.status === 'active');
  const split = active.reduce((s, p) => s + Number(p.weight), 0);
  return (
    <section className="card stack">
      <h2>Landing pages</h2>
      <p className="muted">
        Publishers can choose a page for their link. Visitors without a choice are split by the % below; the rest
        ({100 - split}%) go to the default landing page.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>URL</th><th className="num">Split</th><th className="num">Clicks (30 days)</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td>–</td><td>Default</td><td><code>{defaultUrl}</code></td><td className="num">{100 - split}%</td><td className="num muted">–</td>
              <td><span className="badge active">active</span></td>
            </tr>
            {pages.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td><td>{p.name}</td><td><code>{p.url}</code></td>
                <td className="num">{p.status === 'active' ? `${p.weight}%` : '–'}</td>
                <td className="num">{count(p.clicks)}</td>
                <td><span className={`badge ${p.status}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid2">
        <ActionForm action={add} submit="Add landing page" reset>
          <input type="hidden" name="offer_id" value={offerId} />
          <label>Name<input name="name" required maxLength={200} placeholder="Quiz funnel" /></label>
          <label><span>URL (macros: <code>{'{click_id} {pub_id} {sub1}…{sub5}'}</code>)</span>
            <input name="url" type="url" required placeholder="https://brand.com/quiz?click_id={click_id}" />
          </label>
          <label>Split % of visitors who didn&apos;t choose a page (0 = only when chosen)<input name="weight" type="number" min={0} max={100} defaultValue={0} /></label>
        </ActionForm>
        {pages.length > 0 && (
          <ActionForm action={update} submit="Update page">
            <input type="hidden" name="offer_id" value={offerId} />
            <label>Page
              <select name="lp_id" required>
                {pages.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
              </select>
            </label>
            <label>Split %<input name="weight" type="number" min={0} max={100} defaultValue={0} /></label>
            <label>Status
              <select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="archived">Archived (stop sending traffic)</option>
              </select>
            </label>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
