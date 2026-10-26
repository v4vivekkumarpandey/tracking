import Link from 'next/link';
import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, dateTime, trackingBase } from '@/lib/format';
import { ActionForm } from '../../_components/ActionForm';
import { createSmartLink, deleteSmartLink } from '../actions';

export default async function SmartLinks() {
  const me = await requirePublisher();
  const [links, [{ offers }], domains] = await Promise.all([
    q<{ id: number; code: string; name: string; created_at: Date; clicks: number; offers_used: number }>(
      `SELECT s.id, s.code, s.name, s.created_at,
              (SELECT COUNT(*) FROM clicks c WHERE c.smart_link_id = s.id AND c.ts >= UTC_DATE() - INTERVAL 30 DAY) AS clicks,
              (SELECT COUNT(DISTINCT c.offer_id) FROM clicks c WHERE c.smart_link_id = s.id AND c.ts >= UTC_DATE() - INTERVAL 30 DAY) AS offers_used
       FROM smart_links s WHERE s.publisher_id = ? AND s.status = 'active' ORDER BY s.id DESC`, [me.publisherId],
    ),
    q<{ offers: number }>(
      `SELECT COUNT(*) AS offers FROM publisher_offer_access a JOIN offers o ON o.id = a.offer_id
       WHERE a.publisher_id = ? AND a.status = 'approved' AND o.status = 'active'`, [me.publisherId],
    ),
    q<{ hostname: string }>(`SELECT hostname FROM tracking_domains WHERE owner_type = 'publisher' AND owner_id = ? AND status = 'active'`, [me.publisherId]),
  ]);
  const base = domains[0] ? `https://${domains[0].hostname}` : trackingBase();

  return (
    <>
      <div className="crumb">Offers</div>
      <h1>Smart links</h1>
      <div className="card stack">
        <p>
          One link for all your traffic. Each visitor is sent to the best-paying of your approved offers that accepts their
          country and device and hasn&apos;t hit its cap, so you can promote without picking an offer per placement.
        </p>
        <p className="muted">
          It rotates across your <strong>{count(offers)}</strong> approved offer{Number(offers) === 1 ? '' : 's'}, mostly by
          earnings per click, with a small share for testing newer offers. Sub IDs work as on normal links.
          {Number(offers) === 0 && <> <Link href="/publisher/offers">Get approved on offers first.</Link></>}
        </p>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Link</th><th className="num">Clicks 30d</th><th className="num">Offers used</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td><code>{base}/s/{l.code}?sub1=</code></td>
                <td className="num">{count(l.clicks)}</td>
                <td className="num">{count(l.offers_used)}</td>
                <td>{dateTime(l.created_at)}</td>
                <td className="actions">
                  <form action={deleteSmartLink} className="inline"><input type="hidden" name="id" value={l.id} /><button className="danger small">Delete</button></form>
                </td>
              </tr>
            ))}
            {links.length === 0 && <tr><td colSpan={6} className="muted">No smart links yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <ActionForm action={createSmartLink} submit="Create smart link" reset>
        <h2>New smart link</h2>
        <label>Name<input name="name" maxLength={200} placeholder="e.g. TikTok traffic" /></label>
      </ActionForm>
    </>
  );
}
