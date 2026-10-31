import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/server/db';
import { clearSessionCookie, route, SESSION_COOKIE } from '@/server/http';
import { deleteSession } from '@/server/services/auth';

export const POST = route(async () => {
  await deleteSession(getDb(), (await cookies()).get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
