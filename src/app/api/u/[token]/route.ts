import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route } from '@/server/http';
import { unsubscribe } from '@/server/services/business';

/** Public: a customer stops messages from a business (link in every email). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  await rateLimit(`unsub:${clientIp(req)}`, 20, 10 * 60000);
  const body = z.object({ whatsapp: z.boolean().default(true), email: z.boolean().default(true) }).parse(await readJson(req));
  await unsubscribe(getDb(), (await params).token, body);
  return NextResponse.json({ ok: true });
});
