import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route, setSessionCookie } from '@/server/http';
import { createSession, signUp } from '@/server/services/auth';
import { recordReferral } from '@/server/services/promotions';

export const POST = route(async (req: Request) => {
  await rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60000);
  const user = await signUp(getDb(), await readJson(req));
  const ref = (await cookies()).get('ww_ref')?.value;
  if (ref) { try { await recordReferral(getDb(), user.id, ref); } catch { /* attribution must never block sign-up */ } }
  const { token } = await createSession(getDb(), user.id);
  const res = NextResponse.json({ user }, { status: 201 });
  setSessionCookie(res, token);
  return res;
});
