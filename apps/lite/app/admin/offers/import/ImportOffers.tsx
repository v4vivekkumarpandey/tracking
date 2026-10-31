'use client';

import Link from 'next/link';
import { startTransition, useActionState, useRef, useState } from 'react';
import { importOffers, type ImportRow, type ImportState } from '../../actions';

const LABEL: Record<ImportRow['action'], string> = { create: 'new', update: 'update', unchanged: 'no change', error: 'skipped' };
const BADGE: Record<ImportRow['action'], string> = { create: 'active', update: 'pending', unchanged: '', error: 'rejected' };

/** Upload → preview every row → import the valid ones. The same file is sent both times. */
export function ImportOffers() {
  const [state, run, pending] = useActionState<ImportState, FormData>(importOffers, null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  const submit = (mode: 'preview' | 'import') => {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set('mode', mode);
    if (mode === 'preview') setPreviewed(file);
    startTransition(() => run(fd));
  };
  const ready = previewed !== null && previewed === file && state?.mode === 'preview' && !state.error;
  const valid = state?.rows?.filter((r) => r.action === 'create' || r.action === 'update').length ?? 0;
  const done = state?.mode === 'import';

  return (
    <>
      <form ref={ref} className="card stack" onSubmit={(e) => { e.preventDefault(); submit('preview'); }}>
        <h2>Upload offers</h2>
        <label>CSV or Excel file (.csv, .xlsx · up to 1,000 offers, 2 MB)
          <input type="file" name="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? `${f.name}:${f.size}:${f.lastModified}` : null); }} />
        </label>
        <div className="row">
          <button type="submit" className={ready ? 'secondary' : undefined} disabled={pending || !file}>
            {pending && !ready ? 'Checking…' : 'Preview'}
          </button>
          {ready && (
            <button type="button" disabled={pending || valid === 0} onClick={() => submit('import')}>
              {pending ? 'Importing…' : `Import ${valid} offer${valid === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
        {state?.error && <p className="error">{state.error}</p>}
        {state?.summary && <p className={done ? 'ok-text' : undefined}><strong>{done ? 'Done. ' : 'Preview: '}</strong>{state.summary}
          {!done && ' Nothing is saved until you click Import. Rows with errors are skipped.'}</p>}
      </form>

      {state?.rows && (
        <div className="card table-wrap">
          <table className="import-result">
            <thead><tr><th className="num">Row</th><th>Result</th><th>Offer</th><th>Details</th></tr></thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.row}>
                  <td className="num">{r.row}</td>
                  <td><span className={`badge ${BADGE[r.action]}`}>{done && r.action === 'create' ? 'created' : done && r.action === 'update' ? 'updated' : LABEL[r.action]}</span></td>
                  <td>{r.id ? <Link href={`/admin/offers/${r.id}`}>#{r.id} {r.name}</Link> : r.name || <span className="muted">–</span>}</td>
                  <td>
                    {r.error && <span className="error">{r.error}</span>}
                    {r.changes && r.changes.length > 0 && <ul className="changes">{r.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
