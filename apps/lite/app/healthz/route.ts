import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// For uptime monitors. Also applies database migrations on first call.
export async function GET() {
  try {
    await q('SELECT 1');
    return new Response('ok');
  } catch (err) {
    console.error('healthz', err);
    return new Response('database unavailable', { status: 503 });
  }
}
