'use client';

import { useState } from 'react';

/** Builds the publisher's tracking link with optional sub IDs, with a copy button. */
export function LinkBuilder({ base }: { base: string }) {
  const [subs, setSubs] = useState(['', '', '', '', '']);
  const [copied, setCopied] = useState(false);
  const qs = subs
    .map((v, i) => (v ? `sub${i + 1}=${encodeURIComponent(v)}` : ''))
    .filter(Boolean)
    .join('&');
  const url = qs ? `${base}?${qs}` : base;

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
