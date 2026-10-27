import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// GET /thumbs/{offerId}-{key}.{ext}: an offer's logo. The key changes with
// every upload, so old URLs stop working and new ones can be cached forever.
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = (await params).file.match(/^(\d+)-([a-f0-9]{32})\.(png|jpg|gif|webp)$/);
  if (!m) return new Response('Not found', { status: 404 });
  const [row] = await q<{ mime: string; data: Buffer }>(
    `SELECT o.thumb_mime AS mime, t.data FROM offers o JOIN offer_thumbnails t ON t.offer_id = o.id
     WHERE o.id = ? AND o.thumb_key = ?`, [Number(m[1]), m[2]],
  );
  if (!row || !ALLOWED.has(row.mime)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
