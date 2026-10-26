import { q } from '@/lib/db';
import { count, pct } from '@/lib/format';
import { sourceLabel } from '@/lib/sourceLabels';

type Filter = { publisherId?: number; offerId?: number };

/**
 * Clicks and conversions per detected traffic source over the last `days`
 * (raw clicks, so at most the click retention period). The caller has
 * already checked that the viewer may see this publisher / offer.
 */
export async function SourceBreakdown({ filter, days = 30, title }: { filter: Filter; days?: number; title?: string }) {
  const where = [
    ...(filter.publisherId ? ['t.publisher_id = ?'] : []),
    ...(filter.offerId ? ['t.offer_id = ?'] : []),
  ].map((w) => ` AND ${w}`).join('');
  const params = [filter.publisherId, filter.offerId].filter((v): v is number => v !== undefined);

  const [clicks, convs] = await Promise.all([
    q<{ k: string; clicks: string }>(
      `SELECT t.traffic_source AS k, SUM(t.redirect_reason IS NULL) AS clicks FROM clicks t
       WHERE t.ts >= UTC_TIMESTAMP() - INTERVAL ? DAY${where} GROUP BY k`, [days, ...params],
    ),
    q<{ k: string; conv: string; held: string }>(
      `SELECT t.traffic_source AS k, SUM(t.status <> 'rejected') AS conv,
              SUM(t.status = 'pending' AND t.fraud_reasons LIKE '%disallowed traffic source%') AS held
       FROM conversions t WHERE t.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY${where} GROUP BY k`, [days, ...params],
    ),
  ]);

  const rows = new Map<string, { clicks: number; conv: number; held: number }>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { clicks: 0, conv: 0, held: 0 }).get(k)!;
  for (const c of clicks) row(c.k ?? '').clicks = Number(c.clicks);
  for (const c of convs) Object.assign(row(c.k ?? ''), { conv: Number(c.conv), held: Number(c.held) });
  const list = [...rows.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].conv - a[1].conv);

  return (
    <section className="card table-wrap">
      <h2>{title ?? `Traffic sources (last ${days} days)`}</h2>
      <table>
        <thead><tr><th>Source</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th><th className="num">Held (not allowed)</th></tr></thead>
        <tbody>
          {list.map(([k, r]) => (
            <tr key={`s-${k}`}>
              <td>{k ? sourceLabel(k) : <span className="muted">Not recorded</span>}</td>
              <td className="num">{count(r.clicks)}</td>
              <td className="num">{count(r.conv)}</td>
              <td className="num">{pct(r.conv, r.clicks)}</td>
              <td className={`num${r.held ? ' error' : ''}`}>{r.held || '–'}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={5} className="muted">No traffic yet.</td></tr>}
        </tbody>
      </table>
      <p className="muted">Detected from ad click IDs (gclid, msclkid, fbclid…), UTM tags, in-app browsers and the referring site. Clicks without any of these show as Direct / unknown.</p>
    </section>
  );
}
