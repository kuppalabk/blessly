import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route, setSessionCookie } from '@/server/http';
import { resetPassword } from '@/server/services/account';
import { createSession } from '@/server/services/auth';

/** Sets the new password and logs this browser in (every other device is logged out). */
export const POST = route(async (req: Request) => {
  await rateLimit(`reset:${clientIp(req)}`, 20, 15 * 60000);
  const { userId } = await resetPassword(getDb(), await readJson(req));
  const u = await getDb().query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) });
  const res = NextResponse.json({ ok: true });
  if (u && !u.suspendedAt) setSessionCookie(res, (await createSession(getDb(), userId)).token);
  return res;
});
