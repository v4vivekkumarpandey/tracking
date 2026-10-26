import { creativeUrl, type Creative } from '@/lib/creatives';
import { ActionForm } from './ActionForm';
import { uploadCreativeAdmin, deleteCreativeAdmin } from '../admin/actions';
import { uploadCreativeAdvertiser, deleteCreativeAdvertiser } from '../advertiser/actions';

const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : '');

/** Banners and text copy for an offer, with upload/delete (admin or the offer's advertiser). */
export function CreativesManager({ offerId, creatives, canEdit, as = 'admin' }: {
  offerId: number; creatives: Creative[]; canEdit: boolean; as?: 'admin' | 'advertiser';
}) {
  const upload = as === 'admin' ? uploadCreativeAdmin : uploadCreativeAdvertiser;
  const remove = as === 'admin' ? deleteCreativeAdmin : deleteCreativeAdvertiser;
  return (
    <div className="card stack">
      <h2>Creatives</h2>
      <p className="muted">Banners and email/text copy that approved publishers can download. In text, write <code>{'{link}'}</code> where the tracking link should go.</p>
      <div className="creative-grid">
        {creatives.map((c) => (
          <figure key={c.id} className="creative">
            {c.kind === 'banner'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={creativeUrl(c)} alt={c.name} loading="lazy" />
              : <pre className="creative-text">{c.body}</pre>}
            <figcaption>
              <strong>{c.name}</strong>
              <span className="muted">{c.kind === 'banner' ? `${c.width}×${c.height} · ${kb(c.size)}` : 'text'}</span>
              {canEdit && (
                <form action={remove} className="inline">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="offer_id" value={offerId} />
                  <button className="danger small">Delete</button>
                </form>
              )}
            </figcaption>
          </figure>
        ))}
        {creatives.length === 0 && <p className="muted">No creatives yet.</p>}
      </div>
      {canEdit && (
        <div className="grid2">
          <ActionForm action={upload} submit="Upload banner" reset>
            <input type="hidden" name="offer_id" value={offerId} />
            <input type="hidden" name="kind" value="banner" />
            <label>Banner image (PNG, JPG, GIF or WebP, max 2 MB)<input type="file" name="file" accept="image/png,image/jpeg,image/gif,image/webp" required /></label>
            <label>Name (optional)<input name="name" maxLength={200} placeholder="300x250 summer sale" /></label>
          </ActionForm>
          <ActionForm action={upload} submit="Add text" reset>
            <input type="hidden" name="offer_id" value={offerId} />
            <input type="hidden" name="kind" value="text" />
            <label>Name<input name="name" maxLength={200} placeholder="Email copy" /></label>
            <label>Text<textarea name="body" rows={4} maxLength={20000} placeholder={'Get 20% off today: {link}'} required /></label>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
