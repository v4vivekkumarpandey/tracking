import { requireAdmin } from '@/lib/auth';
import { parseFilters } from '@/lib/clickLog';
import { ALL } from '@/lib/dashboard';
import { q } from '@/lib/db';
import { ClickLog } from '../../_components/ClickLog';

export default async function AdminClicks(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const f = parseFilters(await props.searchParams);
  const [offers, publishers] = await Promise.all([
    q<{ id: number; name: string }>(`SELECT id, name FROM offers WHERE status <> 'archived' ORDER BY name`),
    q<{ id: number; name: string }>(`SELECT id, name FROM publishers ORDER BY name`),
  ]);
  return (
    <>
      <div className="crumb">Analyze</div>
      <h1>Click log</h1>
      <p className="muted">Look up a click ID from a dispute (&quot;you missed my conversion&quot;), or check what a publisher, IP or sub ID really sent.</p>
      <ClickLog panel="admin" scope={ALL} f={f} offers={offers} publishers={publishers} />
    </>
  );
}
