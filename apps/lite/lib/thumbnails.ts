import { randomBytes } from 'node:crypto';
import { exec, tx } from './db';
import { imageInfo } from './imageInfo';
import { MAX_THUMB_BYTES } from './offerInfo';

// Offer logos live in MySQL (files in the app folder are lost on every
// Hostinger redeploy) and are served from /thumbs/{offerId}-{key}.{ext}.

/** Validates and stores an offer's logo. Returns an error message or null. */
export async function saveThumbnail(offerId: number, file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return 'Choose an image file.';
  if (file.size > MAX_THUMB_BYTES) return `Logo is larger than ${MAX_THUMB_BYTES / 1024} KB.`;
  const buf = Buffer.from(await file.arrayBuffer());
  const info = imageInfo(buf);
  if (!info) return 'Only PNG, JPG, GIF or WebP images are allowed.';
  if (info.width < 1 || info.height < 1 || info.width > 4000 || info.height > 4000) return 'Image dimensions look invalid.';
  await tx(async (t) => {
    await t.exec(
      `INSERT INTO offer_thumbnails (offer_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)`, [offerId, buf],
    );
    await t.exec(`UPDATE offers SET thumb_key = ?, thumb_mime = ? WHERE id = ?`, [randomBytes(16).toString('hex'), info.mime, offerId]);
  });
  return null;
}

export async function removeThumbnail(offerId: number): Promise<void> {
  await exec(`UPDATE offers SET thumb_key = NULL, thumb_mime = NULL WHERE id = ?`, [offerId]);
  await exec(`DELETE FROM offer_thumbnails WHERE offer_id = ?`, [offerId]);
}
