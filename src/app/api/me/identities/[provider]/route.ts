import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import * as S from '@/server/services/signin';

export const DELETE = route(async (_r: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const u = await requireUser();
  const p = (await params).provider;
  if (p !== 'google' && p !== 'apple') return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  await S.unlinkIdentity(getDb(), u, p);
  return NextResponse.json({ ok: true });
});
