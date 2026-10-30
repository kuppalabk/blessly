import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ id: string; guestId: string }> };
export const PUT = route(async (req: Request, { params }: P) => {
  const u = await requireUser(); const p = await params;
  return NextResponse.json({ guest: await S.updateGuest(getDb(), u.id, p.id, p.guestId, await readJson(req)) });
});
export const DELETE = route(async (_r: Request, { params }: P) => {
  const u = await requireUser(); const p = await params;
  await S.removeGuest(getDb(), u.id, p.id, p.guestId);
  return NextResponse.json({ ok: true });
});
