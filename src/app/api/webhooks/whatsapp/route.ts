import { cfg } from '@/server/settings';
import { NextResponse } from 'next/server';
import { readBodyLimited } from '@/server/http';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/server/db';
import { validMetaSignature } from '@/server/crypto';
import { handleWebhook } from '@/server/services/bizjobs';

/** Meta's one-time check when the webhook URL is saved in the Meta app dashboard. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = u.searchParams.get('hub.verify_token') ?? '';
  const expected = cfg('WHATSAPP_VERIFY_TOKEN') ?? '';
  const ok = u.searchParams.get('hub.mode') === 'subscribe' && expected.length >= 8 && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(u.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
}

/** Delivery statuses and customer replies. Signed by Meta with the app secret (X-Hub-Signature-256). */
export async function POST(req: Request) {
  const raw = await readBodyLimited(req, 3_500_000).then((b) => b.toString('utf8')).catch(() => null);
  if (raw === null) return new NextResponse('Too large', { status: 413 });
  if (!validMetaSignature(raw, req.headers.get('x-hub-signature-256'), cfg('WHATSAPP_APP_SECRET') ?? '')) return new NextResponse('Bad signature', { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new NextResponse('Bad JSON', { status: 400 }); }
  try {
    await handleWebhook(getDb(), payload as Parameters<typeof handleWebhook>[1]);
  } catch (e) {
    console.error('[webhook] failed', e);
    return new NextResponse('Error', { status: 500 }); // Meta retries
  }
  return NextResponse.json({ ok: true });
}
export const dynamic = 'force-dynamic';
