import Link from 'next/link';
import { CLICK_ID_RE, lookupClick, searchClicks, type ClickFilters, type ClickRow } from '@/lib/clickLog';
import type { Scope } from '@/lib/dashboard';
import { dateTime } from '@/lib/format';
import { sourceLabel } from '@/lib/sourceLabels';
import { quickBlock } from '../admin/actions';

type Panel = 'admin' | 'advertiser' | 'publisher';

const REDIRECT: Record<string, string> = {
  geo: 'outside geo → fallback', device: 'wrong device → fallback', cap: 'cap reached → fallback',
  ip: 'IP blocked', dc: 'data center blocked',
};

function flags(r: ClickRow): string[] {
  return [
    r.is_bot ? 'bot' : '',
    r.is_duplicate ? 'duplicate' : '',
    r.ip_type === 'datacenter' ? 'data center / VPN' : '',
    r.redirect_reason ? REDIRECT[r.redirect_reason] ?? r.redirect_reason : '',
  ].filter(Boolean);
}

/**
 * Click log for any panel: filters, a click-ID lookup and the latest 200
 * matching clicks. Visitor IP, network and user agent are admin-only;
 * advertisers see publishers as "Publisher #id".
 */
export async function ClickLog({ panel, scope, f, offers, publishers = [] }: {
  panel: Panel; scope: Scope; f: ClickFilters; offers: { id: number; name: string }[]; publishers?: { id: number; name: string }[];
}) {
  const admin = panel === 'admin';
  const isId = CLICK_ID_RE.test(f.q);
  const [rows, lookup] = await Promise.all([searchClicks(scope, f, admin), isId ? lookupClick(scope, f.q) : Promise.resolve(null)]);
  const pub = (r: { publisher_id: number; publisher: string }) =>
    panel === 'advertiser' ? `Publisher #${r.publisher_id}` : admin ? <Link href={`/admin/publishers/${r.publisher_id}`}>{r.publisher}</Link> : null;

  return (
    <>
      <form className="card row">
        <label style={{ flex: 1, minWidth: 220 }}>
          Search
          <input name="q" defaultValue={f.q} placeholder={admin ? 'click ID, source_id, sub ID, IP or AS number' : 'click ID, source_id or sub ID'} />
        </label>
        <label>Period
          <select name="days" defaultValue={String(f.days)}>
            <option value="1">Last 24 hours</option><option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option>
          </select>
        </label>
        <label>Offer
          <select name="offer" defaultValue={f.offer ?? ''}>
            <option value="">All offers</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        {admin && (
          <label>Publisher
            <select name="publisher" defaultValue={f.publisher ?? ''}>
              <option value="">All publishers</option>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>Show
          <select name="flag" defaultValue={f.flag}>
            <option value="">All clicks</option><option value="flagged">Flagged (bot, duplicate, data center)</option>
            <option value="blocked">Blocked</option><option value="redirected">Redirected</option><option value="converted">Converted</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>

      {isId && (
        <section className="card stack" aria-live="polite">
          <h2>Click ID lookup</h2>
          {!lookup ? (
            <p className="error">Not a valid click ID{panel !== 'admin' ? ' for your account' : ''}. Check that it was copied completely.</p>
          ) : (
            <>
              <dl className="facts">
                <dt>Click ID</dt><dd><code>{f.q.toLowerCase()}</code></dd>
                <dt>Created</dt><dd>{dateTime(lookup.time)} <span className="muted">(signature valid: this ID was issued by us)</span></dd>
                <dt>Offer</dt><dd>{admin ? <Link href={`/admin/offers/${lookup.offerId}`}>{lookup.offer}</Link> : lookup.offer}</dd>
                {panel !== 'publisher' && <><dt>Publisher</dt><dd>{panel === 'advertiser' ? `Publisher #${lookup.publisherId}` : lookup.publisher}</dd></>}
                <dt>Click record</dt><dd>{lookup.stored ? 'Stored (details in the table below)' : 'Not stored any more (older than the click retention period), but conversions still match it'}</dd>
                <dt>Conversions</dt>
                <dd>
                  {lookup.conversions.length === 0 ? <span className="muted">None recorded for this click.</span>
                    : lookup.conversions.map((c) => (
                      <div key={c.id}>
                        #{c.id} {c.goal || 'default'} · <span className={`badge ${c.status}`}>{c.status}</span> · {dateTime(c.created_at)}
                        {c.reject_reason && <span className="muted"> · {c.reject_reason}</span>}
                        {panel !== 'publisher' && c.fraud_score >= 70 && <span className="error"> · held (risk {c.fraud_score})</span>}
                      </div>
                    ))}
                </dd>
                {panel !== 'publisher' && (
                  <>
                    <dt>Postbacks received</dt>
                    <dd>
                      {lookup.postbacks.length === 0 ? <span className="muted">The advertiser has not reported this click.</span>
                        : lookup.postbacks.map((p) => (
                          <div key={p.id}>{dateTime(p.created_at)} · {p.source} · <span className={p.status === 'rejected' ? 'error' : ''}>{p.status}{p.message ? `: ${p.message}` : ''}</span></div>
                        ))}
                    </dd>
                  </>
                )}
              </dl>
            </>
          )}
        </section>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time (UTC)</th><th>Click ID</th><th>Offer</th>{panel !== 'publisher' && <th>Publisher</th>}
              <th>Visitor</th><th>Source</th><th>source_id / sub1</th><th>Landing</th><th>Flags</th><th className="num">Conv.</th>
              {admin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.click_id}>
                <td>{dateTime(r.ts)}</td>
                <td><Link href={`/${panel}/clicks?q=${r.click_id}`} title="Show full click ID and its conversions"><code>{r.click_id.slice(0, 12)}…</code></Link></td>
                <td>{r.offer}</td>
                {panel !== 'publisher' && <td>{pub(r)}</td>}
                <td>
                  {[r.country || '??', r.device].filter(Boolean).join(' · ')}
                  {admin && <div className="muted mono" title={r.ua}>{r.ip}{r.asn_org && ` · ${r.asn_org}`}{r.asn ? ` (AS${r.asn})` : ''}</div>}
                </td>
                <td>{sourceLabel(r.traffic_source)}{r.referer_host && <div className="muted">{r.referer_host}</div>}</td>
                <td className="mono">{r.source_id && <div>{r.source_id}</div>}{r.sub1}</td>
                <td>{r.lp_name ?? <span className="muted">default</span>}</td>
                <td className={flags(r).length ? 'error' : ''}>{flags(r).join(', ') || <span className="muted">–</span>}</td>
                <td className="num">{Number(r.conv) ? <strong>{r.conv}</strong> : '–'}</td>
                {admin && (
                  <td>
                    {r.ip && r.redirect_reason !== 'ip' && (
                      <form action={quickBlock} className="inline">
                        <input type="hidden" name="rule" value={r.ip} />
                        <input type="hidden" name="note" value={`from click log: ${r.publisher}`} />
                        <button className="danger small" title="Block this IP for all offers">Block IP</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={admin ? 11 : panel === 'advertiser' ? 10 : 9} className="muted">No clicks match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">Latest 200 matches. Raw clicks are kept for {process.env.CLICK_RETENTION_DAYS ?? 90} days; totals in Reports are kept forever.</p>
    </>
  );
}
