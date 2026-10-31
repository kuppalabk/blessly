import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import * as S from '@/server/services/signin';

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`sms-verify-start:${u.id}`, 5, 60 * 60000);
  const body = (await readJson(req)) as { phone?: string; token?: string; code?: string };
  if (body.token) return NextResponse.json(await S.confirmPhone(getDb(), u, body.token, String(body.code ?? '')));
  return NextResponse.json(await S.startPhoneVerify(getDb(), u, body));
});
export const DELETE = route(async () => {
  const u = await requireUser();
  await S.removePhone(getDb(), u);
  return NextResponse.json({ ok: true });
});
