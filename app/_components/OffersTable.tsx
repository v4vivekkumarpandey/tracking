import Link from 'next/link';
import type { OfferRow } from '@/lib/dashboard';
import { CURRENCY } from '@/lib/format';
import { fmtMetric } from '@/lib/fmt';

type Col = 'revenue' | 'payout' | 'margin' | 'epc';

/** "Offers this month" table; each panel picks which money columns it may see. */
export function OffersTable({ rows, cols, hrefBase, labels = {}, empty, note }: {
  rows: OfferRow[];
  cols: Col[];
  hrefBase: string;
  labels?: Partial<Record<Col, string>>;
  empty: React.ReactNode;
  note?: string;
}) {
  const m = (metric: 'clicks' | 'conversions' | 'cvr' | Col, v: number) => fmtMetric(metric, v, CURRENCY);
  const name = (c: Col) => labels[c] ?? { revenue: 'Revenue', payout: 'Payout', margin: 'Margin', epc: 'EPC' }[c];
  const cell = (c: Col, o: OfferRow) =>
    c === 'margin' ? m(c, o.revenue - o.payout)
    : c === 'epc' ? (o.clicks ? m(c, o.payout / o.clicks) : '–')
    : m(c, o[c]);
  return (
    <section className="card table-wrap">
      <h2>Offers this month</h2>
      <table className="offers-table">
        <thead>
          <tr>
            <th>Offer</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">CVR</th>
            {cols.map((c) => <th key={c} className="num">{name(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td><Link href={`${hrefBase}/${o.id}`}>{o.name}</Link></td>
              <td className="num">{m('clicks', o.clicks)}</td>
              <td className="num">{m('conversions', o.conversions)}</td>
              <td className="num">{o.clicks ? m('cvr', (o.conversions / o.clicks) * 100) : '–'}</td>
              {cols.map((c) => <td key={c} className="num">{cell(c, o)}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4 + cols.length} className="muted">{empty}</td></tr>}
        </tbody>
      </table>
      {note && <p className="muted">{note}</p>}
    </section>
  );
}
