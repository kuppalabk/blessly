import { getDb } from '@/server/db';
import { validMediaSignature } from '@/server/providers/storage';
import { photoFile } from '@/server/services/albums';

/** Serves album photos. Links are signed per photo, so only people shown the album can load them. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  const t = new URL(req.url).searchParams.get('t') ?? '';
  if ((variant !== 'full' && variant !== 'thumb') || !validMediaSignature(id, variant, t)) return new Response('Not found', { status: 404 });
  const data = await photoFile(getDb(), id, variant);
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(data), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
