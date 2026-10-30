import { getDb } from '@/server/db';
import { validFileSignature } from '@/server/providers/storage';
import { fileData } from '@/server/services/designs';

/** Serves card photos, finished cards and recorded messages. Links are signed per file. Supports Range for audio/video seeking. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = new URL(req.url).searchParams.get('t') ?? '';
  if (!validFileSignature(id, t)) return new Response('Not found', { status: 404 });
  const f = await fileData(getDb(), id);
  if (!f) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const size = f.data.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(new Uint8Array(f.data.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(new Uint8Array(f.data), { headers: { ...headers, 'content-length': String(f.data.length) } });
}
