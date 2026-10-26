'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SUB_FIELDS, type SubField } from '@/lib/subs';

/** Builds the publisher's tracking link: domain, landing page, optional deep link and sub IDs, with a copy button. */
export function LinkBuilder({ path, domains, deeplinkHost, landings }: {
  path: string; domains: { base: string; label: string }[]; deeplinkHost: string | null;
  /** id 0 = the offer's default landing page. */
  landings: { id: number; name: string; preview: string }[];
}) {
  const [base, setBase] = useState(domains[0].base);
  const [lp, setLp] = useState(0);
  const [subs, setSubs] = useState<Partial<Record<SubField, string>>>({});
  const [deep, setDeep] = useState('');
  const [copied, setCopied] = useState(false);
  const params = SUB_FIELDS.filter((k) => subs[k]?.trim()).map((k) => `${k}=${encodeURIComponent(subs[k]!.trim())}`);
  if (lp) params.push(`lp=${lp}`);
  if (deeplinkHost && deep.trim()) params.push(`url=${encodeURIComponent(deep.trim())}`);
  const page = landings.find((l) => l.id === lp);
  const url = `${base}${path}${params.length ? `?${params.join('&')}` : ''}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="card stack">
      <h2>Your tracking link</h2>
      <div className="copy-row">
        <code className="link-out">{url}</code>
        <button type="button" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <label>
        Domain
        <select name="domain" value={base} onChange={(e) => setBase(e.target.value)}>
          {domains.map((d) => <option key={d.base} value={d.base}>{d.label}</option>)}
        </select>
      </label>
      {landings.length > 1 && (
        <label>
          Landing page
          <select name="lp" value={lp} onChange={(e) => setLp(Number(e.target.value))}>
            {landings.map((l) => <option key={l.id} value={l.id}>{l.id ? `#${l.id} ${l.name}` : 'Default (advertiser may split-test)'}</option>)}
          </select>
          {page && <a href={page.preview} target="_blank" rel="noopener noreferrer nofollow" className="muted">Preview {page.preview}</a>}
        </label>
      )}
      {domains.length === 1 && (
        <p className="muted">Want links on your own domain? <Link href="/publisher/domains">Add a tracking domain</Link>.</p>
      )}
      {deeplinkHost && (
        <label>
          <span>Deep link (optional): send visitors to a specific page on <code>{deeplinkHost}</code> instead of the default landing page</span>
          <input name="deeplink" type="url" value={deep} onChange={(e) => setDeep(e.target.value)} placeholder={`https://${deeplinkHost}/product/…`} />
        </label>
      )}
      <p className="muted">
        Optional: <code>source_id</code> (e.g. your site or traffic source) and <code>sub1</code>–<code>sub10</code> travel with each
        click and come back in your reports, click log and postbacks (as <code>{'{source_id}'}</code>, <code>{'{sub1}'}</code>…). Put your
        own click ID in <code>sub1</code>, e.g. <code>sub1={'{your_click_id}'}</code>; leave the rest empty if you don&apos;t need them.
      </p>
      <div className="sub-grid">
        {SUB_FIELDS.map((k) => (
          <label key={k}>
            {k}
            <input name={k} value={subs[k] ?? ''} maxLength={255}
              onChange={(e) => setSubs((s) => ({ ...s, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
    </section>
  );
}
