import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ celebrations: await S.listCelebrations(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ celebration: await S.createCelebration(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
