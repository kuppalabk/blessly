import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, route, SESSION_COOKIE, setAdminCookie } from '@/server/http';
import { assertAdmin, startSupportView, SUPPORT_VIEW_MINUTES } from '@/server/services/admin';

/** Starts a read-only support view of this user in the admin's browser. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await currentUser();
  assertAdmin(admin);
  await rateLimit(`viewas:${admin.id}`, 20, 60 * 60000);
  const own = (await cookies()).get(SESSION_COOKIE)?.value;
  const { token } = await startSupportView(getDb(), admin, (await params).id, await readJson(req));
  const res = NextResponse.json({ ok: true });
  // Swap cookies: the browser now acts as the user (read-only); the admin's own session is kept aside for "Exit".
  setAdminCookie(res, own!, SUPPORT_VIEW_MINUTES * 60);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SUPPORT_VIEW_MINUTES * 60 });
  return res;
});
