import { cfg } from '@/server/settings';
import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { readBodyLimited } from '@/server/http';
import { handleRazorpayWebhook } from '@/server/services/billing';

export async function POST(req: Request) {
  const raw = await readBodyLimited(req, 1_000_000).then((b) => b.toString('utf8')).catch(() => null);
  if (raw === null) return new NextResponse('Too large', { status: 413 });
  try {
    const r = await handleRazorpayWebhook(getDb(), raw, req.headers.get('x-razorpay-signature'), req.headers.get('x-razorpay-event-id'), cfg('RAZORPAY_WEBHOOK_SECRET') ?? '');
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[razorpay webhook]', e);
    return NextResponse.json({ error: 'Error' }, { status: 500 }); // Razorpay retries
  }
}
export const dynamic = 'force-dynamic';
