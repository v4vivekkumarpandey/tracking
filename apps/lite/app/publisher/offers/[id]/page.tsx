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
import { LISTED, thumbUrl } from '@/lib/offerInfo';
import { OfferInfo } from '../../../_components/OfferInfo';
import { requestAccess } from '../../actions';
import { LinkBuilder } from './LinkBuilder';

export default async function PublisherOffer({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ terms?: string }>;
}) {
  const me = await requirePublisher();
  const oid = Number((await params).id);
  if (!Number.isInteger(oid)) notFound();
  const termsMissing = (await searchParams).terms === 'required';

  const [o] = await q<{
    id: number; name: string; description: string | null; payout_model: string; attribution_days: number;
    default_payout: string; payout_percent: string | null; payout_override: string | null; access: string | null; code: string | null;
    deeplink_enabled: number; destination_url: string; visibility: string;
    countries: string | null; devices: string | null; os_targets: string | null; daily_cap: number | null; monthly_cap: number | null; blocked_sources: string | null;
    kpi: string | null; preview_url: string | null; category: string | null; terms: string | null; require_terms: number;
    thumb_key: string | null; thumb_mime: string | null;
  }>(
    `SELECT o.id, o.name, o.description, o.payout_model, o.attribution_days, o.default_payout, o.payout_percent,
            o.deeplink_enabled, o.destination_url, o.visibility, o.countries, o.devices, o.os_targets, o.daily_cap, o.monthly_cap, o.blocked_sources,
            o.kpi, o.preview_url, o.category, o.terms, o.require_terms, o.thumb_key, o.thumb_mime,
            a.payout_override, a.status AS access, l.code
     FROM offers o
     LEFT JOIN publisher_offer_access a ON a.offer_id = o.id AND a.publisher_id = ?
     LEFT JOIN tracking_links l ON l.offer_id = o.id AND l.publisher_id = ? AND l.status = 'active'
     WHERE o.id = ? AND o.status = 'active' AND (o.visibility IN ${LISTED} OR a.status = 'approved')`,
    [me.publisherId, me.publisherId, oid],
  );
  if (!o) notFound();
  const logo = thumbUrl(o);

  const [goals, creatives, landings] = await Promise.all([
    q<{ code: string; name: string; payout: string | null }>(`SELECT code, name, payout FROM offer_goals WHERE offer_id = ? ORDER BY code`, [oid]),
    o.access === 'approved' ? creativesFor(oid) : Promise.resolve([]),
    q<{ id: number; name: string; url: string }>(
      `SELECT id, name, url FROM offer_landing_pages WHERE offer_id = ? AND status = 'active' ORDER BY id`, [oid],
    ),
  ]);
  // Preview links without our macros ({click_id} etc. are filled in per click).
  const preview = (u: string) => u.replace(/\{[a-z0-9_]+\}/gi, '');
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
      <h1 className="offer-title">{logo && <img src={logo} alt="" className="offer-thumb" />}{o.name}</h1>

      <div className="card stack">
        <div className="offer-meta">
          <div><span className="muted">Payout</span><strong>{payoutText(o)}</strong></div>
          <div><span className="muted">Model</span><strong>{o.payout_model}</strong></div>
          <div><span className="muted">Cookie window</span><strong>{o.attribution_days} days</strong></div>
        </div>
        <TargetingSummary o={o} showBudget={false} />
        <OfferInfo o={o} />
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
            deeplinkHost={o.deeplink_enabled ? landingHost(o.destination_url) : null}
            landings={[{ id: 0, name: 'Default', preview: preview(o.destination_url) },
              ...landings.map((l) => ({ id: Number(l.id), name: l.name, preview: preview(l.url) }))]} />
          <CreativesGallery creatives={creatives} link={`${trackingBase()}${link}`} />
        </>
      ) : o.access === 'pending' ? (
        <div className="card notice">Your request is waiting for approval. You&apos;ll get your tracking link here once it&apos;s approved.</div>
      ) : o.access === 'rejected' ? (
        <div className="card">Your request for this offer was not approved.</div>
      ) : (
        <form action={requestAccess} className="card stack">
          <input type="hidden" name="offer_id" value={o.id} />
          <span>
            Want to run this offer?
            {o.visibility === 'open' ? ' You get your tracking link right away.' : ' The network reviews your request first.'}
          </span>
          {!!o.require_terms && (
            <label className="check">
              <input type="checkbox" name="accept_terms" required /> I have read and accept the terms and conditions above
            </label>
          )}
          {termsMissing && <p className="error">Please accept the terms and conditions to continue.</p>}
          <div><button type="submit">{o.visibility === 'open' ? 'Get tracking link' : 'Request access'}</button></div>
        </form>
      )}
    </>
  );
}
