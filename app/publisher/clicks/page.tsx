import { requirePublisher } from '@/lib/auth';
import { parseFilters } from '@/lib/clickLog';
import { q } from '@/lib/db';
import { ClickLog } from '../../_components/ClickLog';

export default async function PublisherClicks(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePublisher();
  const f = parseFilters(await props.searchParams);
  const offers = await q<{ id: number; name: string }>(
    `SELECT o.id, o.name FROM offers o JOIN tracking_links l ON l.offer_id = o.id AND l.publisher_id = ? ORDER BY o.name`, [me.publisherId],
  );
  return (
    <>
      <div className="crumb">Reporting</div>
      <h1>Click log</h1>
      <p className="muted">Search your clicks by sub ID or click ID to check that your traffic arrived and converted.</p>
      <ClickLog panel="publisher" scope={{ kind: 'publisher', id: me.publisherId }} f={f} offers={offers} />
    </>
  );
}
