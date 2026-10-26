import { randomBytes } from 'node:crypto';
import { exec, q } from './db';
import { trackingBase } from './format';
import { imageInfo } from './imageInfo';

// Offer creatives: banners (stored in MySQL) and text/email copy. Banners
// are served publicly from /creatives/{id}-{key}.{ext} so publishers can
// embed them on their sites; the random key keeps URLs unguessable, and
// the list itself is only shown to people allowed to run the offer.

export const MAX_BANNER_BYTES = 2 * 1024 * 1024;

export type Creative = {
  id: number; offer_id: number; kind: 'banner' | 'text'; name: string; mime: string | null;
  width: number | null; height: number | null; size: number | null; public_key: string; body: string | null; created_at: Date;
};

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

export function creativeUrl(c: Pick<Creative, 'id' | 'public_key' | 'mime'>): string {
  return `${trackingBase()}/creatives/${c.id}-${c.public_key}.${EXT[c.mime ?? ''] ?? 'bin'}`;
}

export function creativesFor(offerId: number): Promise<Creative[]> {
  return q<Creative>(
    `SELECT id, offer_id, kind, name, mime, width, height, size, public_key, body, created_at
     FROM creatives WHERE offer_id = ? ORDER BY kind, id`, [offerId],
  );
}

/** Validates and stores an uploaded creative. Returns an error message or null. */
export async function addCreative(offerId: number, fd: FormData, by: string): Promise<string | null> {
  const name = String(fd.get('name') ?? '').trim().slice(0, 200);
  const kind = String(fd.get('kind') ?? 'banner');
  const key = randomBytes(16).toString('hex');

  if (kind === 'text') {
    const body = String(fd.get('body') ?? '').trim();
    if (!body) return 'Enter the text or email copy.';
    if (body.length > 20_000) return 'Text is too long (max 20,000 characters).';
    await exec(
      `INSERT INTO creatives (offer_id, kind, name, public_key, body, created_by) VALUES (?, 'text', ?, ?, ?, ?)`,
      [offerId, name || 'Text', key, body, by],
    );
    return null;
  }

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return 'Choose an image file.';
  if (file.size > MAX_BANNER_BYTES) return 'Image is larger than 2 MB.';
  const buf = Buffer.from(await file.arrayBuffer());
  const info = imageInfo(buf);
  if (!info) return 'Only PNG, JPG, GIF or WebP images are allowed.';
  if (info.width < 1 || info.height < 1 || info.width > 10_000 || info.height > 10_000) return 'Image dimensions look invalid.';

  await exec(
    `INSERT INTO creatives (offer_id, kind, name, mime, width, height, size, public_key, data, created_by)
     VALUES (?, 'banner', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [offerId, name || file.name.slice(0, 200) || `${info.width}x${info.height}`, info.mime, info.width, info.height, buf.length, key, buf, by],
  );
  return null;
}

export async function deleteCreative(id: number, offerId: number): Promise<void> {
  await exec(`DELETE FROM creatives WHERE id = ? AND offer_id = ?`, [id, offerId]);
}
