import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ id: string }> };
export const GET = route(async (_r: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json(await S.hostView(getDb(), u.id, (await params).id));
});
export const PUT = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json({ celebration: await S.updateCelebration(getDb(), u.id, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_r: Request, { params }: P) => {
  const u = await requireUser();
  await S.deleteCelebration(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
