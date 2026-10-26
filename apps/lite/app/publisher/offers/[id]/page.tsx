import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { money, trackingBase } from '@/lib/format';
import { creativesFor } from '@/lib/creatives';
import { landingHost } from '@/lib/deeplink';
import { linkDomainOptions } from '@/lib/domains';
import { CreativesGallery } from '../../../_components/CreativesGallery';
import { TargetingSummary } from '../../../_components/TargetingSummary';
import { payoutText } from '@/lib/offerView';
import { requestAccess } from '../../actions';
import { LinkBuilder } from './LinkBuilder';

export default async function PublisherOffer({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePublisher();
  const oid = Number((await params).id);
  if (!Number.isInteger(oid)) notFound();

  const [o] = await q<{
    id: number; name: string; description: string | null; payout_model: string; attribution_days: number;
    default_payout: string; payout_percent: string | null; payout_override: string | null; access: string | null; code: string | null;
    deeplink_enabled: number; destination_url: string;
    countries: string | null; devices: string | null; daily_cap: number | null; monthly_cap: number | null; blocked_sources: string | null;
  }>(
    `SELECT o.id, o.name, o.description, o.payout_model, o.attribution_days, o.default_payout, o.payout_percent,
            o.deeplink_enabled, o.destination_url, o.countries, o.devices, o.daily_cap, o.monthly_cap, o.blocked_sources,
            a.payout_override, a.status AS access, l.code
     FROM offers o
     LEFT JOIN publisher_offer_access a ON a.offer_id = o.id AND a.publisher_id = ?
     LEFT JOIN tracking_links l ON l.offer_id = o.id AND l.publisher_id = ? AND l.status = 'active'
     WHERE o.id = ? AND o.status = 'active' AND (o.visibility = 'public' OR a.status = 'approved')`,
    [me.publisherId, me.publisherId, oid],
  );
  if (!o) notFound();

  const [goals, creatives] = await Promise.all([
    q<{ code: string; name: string; payout: string | null }>(`SELECT code, name, payout FROM offer_goals WHERE offer_id = ? ORDER BY code`, [oid]),
    o.access === 'approved' ? creativesFor(oid) : Promise.resolve([]),
  ]);
  const approved = o.access === 'approved' && o.code;
  // Link domains: the advertiser's own (first-party, preferred), then the
  // publisher's own, then ours. Only active custom domains are offered.
  const custom = approved ? await linkDomainOptions(me.publisherId, oid) : [];
  const domainOptions = [
    ...custom.map((d) => ({
      base: `https://${d.hostname}`,
      label: d.owner_type === 'advertiser' ? `${d.hostname} (advertiser domain, recommended)` : `${d.hostname} (your domain)`,
    })),
    { base: trackingBase(), label: `${new URL(trackingBase()).host} (network domain)` },
  ];
  const link = approved ? `/c/${o.code}` : null;

  return (
    <>
      <div className="crumb"><Link href="/publisher/offers">Offers</Link></div>
      <h1>{o.name}</h1>

      <div className="card stack">
        <div className="offer-meta">
          <div><span className="muted">Payout</span><strong>{payoutText(o)}</strong></div>
          <div><span className="muted">Model</span><strong>{o.payout_model}</strong></div>
          <div><span className="muted">Cookie window</span><strong>{o.attribution_days} days</strong></div>
        </div>
        <TargetingSummary o={o} showBudget={false} />
        {o.description && <p className="wrap">{o.description}</p>}
        {goals.length > 0 && (
          <table>
            <thead><tr><th>Event</th><th>Code</th><th className="num">Payout</th></tr></thead>
            <tbody>
              {goals.map((g) => (
                <tr key={g.code}><td>{g.name}</td><td><code>{g.code}</code></td>
                  <td className="num">{o.payout_override ? money(o.payout_override) : g.payout ? money(g.payout) : payoutText(o)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {link ? (
        <>
          <LinkBuilder path={link} domains={domainOptions}
            deeplinkHost={o.deeplink_enabled ? landingHost(o.destination_url) : null} />
          <CreativesGallery creatives={creatives} link={`${trackingBase()}${link}`} />
        </>
      ) : o.access === 'pending' ? (
        <div className="card notice">Your request is waiting for approval. You&apos;ll get your tracking link here once it&apos;s approved.</div>
      ) : o.access === 'rejected' ? (
        <div className="card">Your request for this offer was not approved.</div>
      ) : (
        <form action={requestAccess} className="card row">
          <input type="hidden" name="offer_id" value={o.id} />
          <span>Want to run this offer?</span>
          <button type="submit">Request access</button>
        </form>
      )}
    </>
  );
}
