'use client';

import { useActionState } from 'react';
import type { Trace } from '@/lib/linkTest';
import { TEST_DEVICES } from '@/lib/testDevices';

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/** Paste a tracking link, see every redirect hop with its time. */
export function LinkTest({ action, panel, example }: {
  action: (s: Trace, fd: FormData) => Promise<Trace>; panel: 'admin' | 'publisher'; example: string;
}) {
  const [t, run, pending] = useActionState<Trace, FormData>(action, null);
  return (
    <>
      <form action={run} className="card stack">
        <label>Tracking link
          <input name="url" type="url" required placeholder={example} defaultValue="" />
        </label>
        <div className="row">
          <label>Test as
            <select name="device" defaultValue="desktop">
              {Object.entries(TEST_DEVICES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={pending}>{pending ? 'Testing…' : 'Test link'}</button>
        </div>
        <p className="muted">
          The test runs from our server (USA), so the country is always US; pick the device to check device and OS targeting.
          The test click shows in the Click log as a bot click and is not counted in your stats.
        </p>
      </form>

      {t?.error && <div className="card error">{t.error}</div>}
      {t?.hops && (
        <section className="card table-wrap" aria-live="polite">
          <h2>Redirect chain: {t.hops.length} hop{t.hops.length === 1 ? '' : 's'}, {t.totalMs} ms</h2>
          <table>
            <thead><tr><th>#</th><th>Status</th><th className="num">Time</th><th>Host</th><th>URL</th></tr></thead>
            <tbody>
              {t.hops.map((h, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className={h.error || (h.status ?? 0) >= 400 ? 'error' : ''}>
                    {h.error ?? h.status}{i > 0 && <div className="muted small">via {h.via}</div>}
                  </td>
                  <td className="num">{h.ms} ms{h.appMs !== null && <div className="muted small">our server {h.appMs} ms</div>}</td>
                  <td>{hostOf(h.url)}</td>
                  <td className="wrap"><code>{h.url}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.clickId ? (
            <p>
              Click ID <code>{t.clickId}</code>{' '}
              {t.carried && t.carried.length > 0
                ? <>was passed on in: {t.carried.map((c) => `hop ${c.hop + 1} (${c.params.join(', ')})`).join(' · ')}.</>
                : null}
              {' '}<a href={`/${panel}/clicks?q=${t.clickId}`}>Open in Click log</a>
            </p>
          ) : (
            <p className="error">No click ID of ours was found in the redirect URLs: the offer URL may be missing {'{click_id}'}, so conversions could not be matched.</p>
          )}
          {t.note && <p className="muted">{t.note}</p>}
        </section>
      )}
    </>
  );
}
