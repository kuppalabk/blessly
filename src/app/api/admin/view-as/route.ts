import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/server/db';
import { ADMIN_COOKIE, route, SESSION_COOKIE, setSessionCookie } from '@/server/http';
import { endSupportView } from '@/server/services/admin';

/** Ends the support view and puts the admin's own session back. */
export const DELETE = route(async () => {
  const jar = await cookies();
  await endSupportView(getDb(), jar.get(SESSION_COOKIE)?.value);
  const own = jar.get(ADMIN_COOKIE)?.value;
  const res = NextResponse.json({ ok: true, back: !!own });
  if (own) setSessionCookie(res, own);
  else res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
