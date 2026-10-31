import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { IMPORT_COLUMNS } from '@/lib/offerImport';
import { ImportOffers } from './ImportOffers';

export default async function ImportOffersPage() {
  await requireAdmin();
  return (
    <>
      <div className="crumb"><Link href="/admin/offers">Offers</Link> ›</div>
      <h1>Import / export offers</h1>

      <div className="card stack">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>New offers:</strong> download the <a href="/export/admin/offers?template=1">template</a>, fill one offer per row in
            Excel or Google Sheets (leave <code>id</code> empty) and upload it as .xlsx or .csv.
          </li>
          <li>
            <strong>Change existing offers:</strong> <a href="/export/admin/offers">export your offers</a>, edit the cells, and upload the file
            again. Rows with an <code>id</code> update that offer. You can delete columns you don&apos;t want to change: a file with only{' '}
            <code>id</code> and <code>payout</code> changes only payouts. An empty cell clears that field.
          </li>
          <li>Click <strong>Preview</strong> to check every row, then <strong>Import</strong>. Rows with errors are skipped and listed, so you can fix them and upload just those again.</li>
        </ol>
        <div className="row">
          <a className="button secondary-button" href="/export/admin/offers?template=1">Download template (CSV)</a>
          <a className="button secondary-button" href="/export/admin/offers">Export all offers (CSV)</a>
        </div>
      </div>

      <ImportOffers />

      <details className="card">
        <summary><strong>Columns</strong> <span className="muted">names are not case-sensitive</span></summary>
        <table style={{ marginTop: 8 }}>
          <tbody>
            {IMPORT_COLUMNS.map((c) => (
              <tr key={c.key}><td><code>{c.key}</code></td><td>{c.help}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Logos, creatives, landing pages and goals are not part of the file; add them on the offer page.</p>
      </details>
    </>
  );
}
