import { requireAdvertiser } from '@/lib/auth';
import { parseFilters } from '@/lib/clickLog';
import { q } from '@/lib/db';
import { ClickLog } from '../../_components/ClickLog';

export default async function AdvertiserClicks(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdvertiser();
  const f = parseFilters(await props.searchParams);
  const offers = await q<{ id: number; name: string }>(
    `SELECT id, name FROM offers WHERE advertiser_id = ? AND status <> 'archived' ORDER BY name`, [me.advertiserId],
  );
  return (
    <>
      <div className="crumb">Reporting</div>
      <h1>Click log</h1>
      <p className="muted">Paste a click ID from your order records to see when it happened and whether we received your postback for it.</p>
      <ClickLog panel="advertiser" scope={{ kind: 'advertiser', id: me.advertiserId }} f={f} offers={offers} />
    </>
  );
}
