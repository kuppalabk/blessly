import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ token: string }> };
export const PUT = route(async (req: Request, { params }: P) => {
  const body = (await readJson(req)) as { purchased?: boolean };
  await L.markPurchased(getDb(), (await params).token, !!body.purchased);
  return NextResponse.json({ ok: true });
});
export const DELETE = route(async (_r: Request, { params }: P) => {
  await L.cancelReservation(getDb(), (await params).token);
  return NextResponse.json({ ok: true });
});
