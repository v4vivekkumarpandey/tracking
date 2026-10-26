import { type NextRequest } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// GET /creatives/{id}-{key}.{ext}[?download=1]: public banner URL that
// publishers embed. The 32-hex key makes it unguessable.
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const m = (await params).file.match(/^(\d+)-([a-f0-9]{32})\.(png|jpg|gif|webp)$/);
  if (!m) return new Response('Not found', { status: 404 });
  const [row] = await q<{ name: string; mime: string; data: Buffer }>(
    `SELECT name, mime, data FROM creatives WHERE id = ? AND public_key = ? AND kind = 'banner'`, [Number(m[1]), m[2]],
  );
  if (!row || !ALLOWED.has(row.mime)) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': row.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  };
  if (req.nextUrl.searchParams.get('download')) {
    headers['Content-Disposition'] = `attachment; filename="${row.name.replace(/[^\w.-]+/g, '_').slice(0, 80)}.${m[3]}"`;
  }
  return new Response(new Uint8Array(row.data), { headers });
}
