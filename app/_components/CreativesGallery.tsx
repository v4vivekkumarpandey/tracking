import { creativeUrl, type Creative } from '@/lib/creatives';

/** Publisher view: download banners or copy ready-made HTML/text with their tracking link in it. */
export function CreativesGallery({ creatives, link }: { creatives: Creative[]; link: string }) {
  if (creatives.length === 0) return null;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return (
    <section className="card stack">
      <h2>Creatives</h2>
      <p className="muted">The HTML and text below already contain your tracking link (the network domain without sub IDs). Adjust sub IDs in the link builder above if needed.</p>
      <div className="creative-grid">
        {creatives.map((c) => {
          const url = creativeUrl(c);
          const snippet = c.kind === 'banner'
            ? `<a href="${esc(link)}" target="_blank" rel="sponsored noopener"><img src="${esc(url)}" width="${c.width}" height="${c.height}" alt="${esc(c.name)}" /></a>`
            : (c.body ?? '').replace(/\{link\}/g, link);
          return (
            <figure key={c.id} className="creative">
              {c.kind === 'banner'
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={url} alt={c.name} loading="lazy" />
                : <pre className="creative-text">{snippet}</pre>}
              <figcaption>
                <strong>{c.name}</strong>
                {c.kind === 'banner' && <><span className="muted">{c.width}×{c.height}</span> <a href={`${url}?download=1`}>Download</a></>}
              </figcaption>
              <textarea readOnly rows={3} className="snippet" defaultValue={snippet} aria-label={`Code for ${c.name}`} />
            </figure>
          );
        })}
      </div>
    </section>
  );
}
