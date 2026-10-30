import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import * as S from '@/server/services/signin';

import { cookies } from 'next/headers';
import { hashToken } from '@/server/services/auth';
import { SESSION_COOKIE } from '@/server/http';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json(await S.signInOptions(getDb(), u.id));
});
/** Sign out everywhere else. */
export const DELETE = route(async () => {
  const u = await requireUser();
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  await S.signOutOthers(getDb(), u.id, t ? hashToken(t) : null);
  return NextResponse.json({ ok: true });
});
