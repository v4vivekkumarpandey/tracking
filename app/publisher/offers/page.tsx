import Link from 'next/link';
import { requirePublisher } from '@/lib/auth';
import { q } from '@/lib/db';
import { payoutText } from '@/lib/offerView';
import { requestAccess } from '../actions';

type Row = {
  id: number; name: string; description: string | null; payout_model: string; attribution_days: number;
  default_payout: string; payout_percent: string | null; payout_override: string | null; access: string | null;
};

const TABS = { all: 'All offers', mine: 'My offers', pending: 'Requested' } as const;
type Tab = keyof typeof TABS;

export default async function Marketplace(props: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const me = await requirePublisher();
  const sp = await props.searchParams;
  const tab: Tab = sp.tab && sp.tab in TABS ? (sp.tab as Tab) : 'all';
  const search = (sp.q ?? '').trim().slice(0, 100);

  // Public offers, plus private ones this publisher is approved on.
  const rows = await q<Row>(
    `SELECT o.id, o.name, o.description, o.payout_model, o.attribution_days, o.default_payout, o.payout_percent,
            a.payout_override, a.status AS access
     FROM offers o
     LEFT JOIN publisher_offer_access a ON a.offer_id = o.id AND a.publisher_id = ?
     WHERE o.status = 'active' AND (o.visibility = 'public' OR a.status = 'approved')
       AND (? = '' OR o.name LIKE CONCAT('%', ?, '%'))
       AND (? = 'all' OR (? = 'mine' AND a.status = 'approved') OR (? = 'pending' AND a.status = 'pending'))
     ORDER BY a.status = 'approved' DESC, o.id DESC`,
    [me.publisherId, search, search, tab, tab, tab],
  );

  return (
    <>
      <div className="crumb">Offers</div>
      <h1>Offers</h1>
      <form className="card row" role="search">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={search} placeholder="Search offers" aria-label="Search offers" style={{ flex: 1, minWidth: 200 }} />
        <button type="submit">Search</button>
      </form>
      <div className="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={`/publisher/offers?tab=${t}${search ? `&q=${encodeURIComponent(search)}` : ''}`} className={t === tab ? 'active' : undefined}>
            {TABS[t]}
          </Link>
        ))}
      </div>
      <div className="offer-grid">
        {rows.map((o) => (
          <article key={o.id} className="offer-card">
            <header>
              <Link href={`/publisher/offers/${o.id}`}><h2>{o.name}</h2></Link>
              <span className="badge">{o.payout_model}</span>
            </header>
            {o.description && <p className="muted clamp">{o.description}</p>}
            <div className="offer-meta">
              <div><span className="muted">Payout</span><strong>{payoutText(o)}</strong></div>
              <div><span className="muted">Cookie</span><strong>{o.attribution_days} days</strong></div>
            </div>
            <footer>
              {o.access === 'approved' ? (
                <Link href={`/publisher/offers/${o.id}`} className="button">Get link</Link>
              ) : o.access === 'pending' ? (
                <span className="badge pending">Requested</span>
              ) : o.access === 'rejected' ? (
                <span className="badge rejected">Not approved</span>
              ) : (
                <form action={requestAccess}>
                  <input type="hidden" name="offer_id" value={o.id} />
                  <button type="submit">Request access</button>
                </form>
              )}
            </footer>
          </article>
        ))}
        {rows.length === 0 && <div className="card muted">No offers found.</div>}
      </div>
    </>
  );
}
