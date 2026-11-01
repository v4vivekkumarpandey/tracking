'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SUB_FIELDS, type SubField } from '@/lib/subs';

// Google Ads tracking template: Google fills in the {…} values on each click.
const GOOGLE_ADS_QUERY = 'force_transparent=true&redirection_url={lpurl}&gclid={gclid}&source_id={campaignid}&sub1={gclid}&sub2={keyword}&sub3={adgroupid}&sub4={device}';

/** Builds the publisher's tracking link: domain, traffic type, landing page, optional deep link and sub IDs, with a copy button. */
export function LinkBuilder({ path, domains, deeplinkHost, googleAdsDomains, landings }: {
  path: string; domains: { base: string; label: string }[]; deeplinkHost: string | null;
  /** Where Google Ads links may go; null if the offer forbids Google Ads. */
  googleAdsDomains: string[] | null;
  /** id 0 = the offer's default landing page. */
  landings: { id: number; name: string; preview: string }[];
}) {
  const [base, setBase] = useState(domains[0].base);
  const [traffic, setTraffic] = useState<'default' | 'google_ads'>('default');
  const [lp, setLp] = useState(0);
  const [subs, setSubs] = useState<Partial<Record<SubField, string>>>({});
  const [deep, setDeep] = useState('');
  const [copied, setCopied] = useState(false);
  const googleAds = traffic === 'google_ads' && !!googleAdsDomains;
  const params = SUB_FIELDS.filter((k) => subs[k]?.trim()).map((k) => `${k}=${encodeURIComponent(subs[k]!.trim())}`);
  if (lp) params.push(`lp=${lp}`);
  if (deeplinkHost && deep.trim()) params.push(`url=${encodeURIComponent(deep.trim())}`);
  const page = landings.find((l) => l.id === lp);
  const query = googleAds ? GOOGLE_ADS_QUERY : params.join('&');
  const url = `${base}${path}${query ? `?${query}` : ''}`;

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
      {googleAdsDomains && (
        <label>
          Traffic type
          <select name="traffic" value={traffic} onChange={(e) => setTraffic(e.target.value as 'default' | 'google_ads')}>
            <option value="default">Default</option>
            <option value="google_ads">Google Ads</option>
          </select>
        </label>
      )}
      {googleAds && googleAdsDomains ? (
        <div className="notice stack">
          <p style={{ margin: 0 }}>Paste this link into the <strong>Tracking template</strong> field in Google Ads. Your ad&apos;s final URL must be on: <code>{googleAdsDomains.join(', ')}</code>. Any other URL sends visitors to the normal offer page.</p>
          <p style={{ margin: 0 }}>
            Clicks show here with gclid, campaign and keyword. Sales do <strong>not</strong> come back to this panel, because our click ID isn&apos;t
            added to the final URL; they&apos;re tracked by whoever owns that URL. To see sales here too, send the ad to your own landing page and use a Default link on its button.
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
