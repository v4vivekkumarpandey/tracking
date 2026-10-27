import type { FormState } from '@/lib/account';
import { MAX_THUMB_BYTES } from '@/lib/offerInfo';
import { ActionForm } from './ActionForm';

/** Upload or remove an offer's logo (shown to publishers in the marketplace). */
export function OfferLogo({ offerId, url, upload, remove }: {
  offerId: number; url: string | null;
  upload: (s: FormState, fd: FormData) => Promise<FormState>;
  remove: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="card stack">
      <h2>Logo</h2>
      <div className="row">
        {url
          ? <img src={url} alt="Offer logo" className="offer-thumb large" />
          : <span className="muted">No logo yet. Publishers see it on the offer card in the marketplace.</span>}
        {url && (
          <form action={remove} className="inline">
            <input type="hidden" name="offer_id" value={offerId} />
            <button className="danger small">Remove logo</button>
          </form>
        )}
      </div>
      <ActionForm action={upload} submit={url ? 'Replace logo' : 'Upload logo'} reset>
        <input type="hidden" name="offer_id" value={offerId} />
        <label>Image (PNG, JPG, GIF or WebP, max {MAX_THUMB_BYTES / 1024} KB, square works best)
          <input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required />
        </label>
      </ActionForm>
    </div>
  );
}
