import { trackingBase } from './format';

// Offer details shown to publishers, and the labels shared by every panel.

export const OS_TARGETS = { android: 'Android', ios: 'iOS', windows: 'Windows', mac: 'Mac' } as const;
export const osLabel = (k: string) => OS_TARGETS[k as keyof typeof OS_TARGETS] ?? k;

export const VISIBILITY = {
  open: 'Public, instant link',
  public: 'Public, approval required',
  private: 'Private',
} as const;
export type Visibility = keyof typeof VISIBILITY;

/** Visibility values a publisher can see in the marketplace. */
export const LISTED = `('public', 'open')`;

export const MAX_THUMB_BYTES = 300 * 1024;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Public logo URL; the key changes on every upload, so it can be cached forever. */
export function thumbUrl(o: { id: number; thumb_key: string | null; thumb_mime: string | null }): string | null {
  if (!o.thumb_key || !o.thumb_mime || !EXT[o.thumb_mime]) return null;
  return `${trackingBase()}/thumbs/${o.id}-${o.thumb_key}.${EXT[o.thumb_mime]}`;
}
