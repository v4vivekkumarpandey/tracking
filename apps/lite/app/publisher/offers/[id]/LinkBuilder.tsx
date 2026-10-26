'use client';

import Link from 'next/link';
import { useState } from 'react';

/** Builds the publisher's tracking link: domain choice, optional deep link and sub IDs, with a copy button. */
export function LinkBuilder({ path, domains, deeplinkHost }: {
  path: string; domains: { base: string; label: string }[]; deeplinkHost: string | null;
}) {
  const [base, setBase] = useState(domains[0].base);
  const [subs, setSubs] = useState(['', '', '', '', '']);
  const [deep, setDeep] = useState('');
  const [copied, setCopied] = useState(false);
  const params = subs.map((v, i) => (v ? `sub${i + 1}=${encodeURIComponent(v)}` : '')).filter(Boolean);
  if (deeplinkHost && deep.trim()) params.push(`url=${encodeURIComponent(deep.trim())}`);
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
        Optional sub IDs travel with each click and come back in your reports and postbacks. Put your own click ID or
        traffic source in <code>sub1</code>, e.g. <code>sub1={'{your_click_id}'}</code>.
      </p>
      <div className="row">
        {subs.map((v, i) => (
          <label key={i}>
            sub{i + 1}
            <input value={v} maxLength={255} style={{ width: 130 }}
              onChange={(e) => setSubs((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
    </section>
  );
}
