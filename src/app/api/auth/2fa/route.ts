import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route, setSessionCookie } from '@/server/http';
import { createSession } from '@/server/services/auth';
import { completeMfaChallenge } from '@/server/services/signin';
import { MFA_COOKIE } from '@/server/signin-flow';

/** Second step: the authenticator-app code (or a recovery code). */
export const POST = route(async (req: Request) => {
  await rateLimit(`2fa:${clientIp(req)}`, 20, 15 * 60000);
  const { code } = (await readJson(req)) as { code?: string };
  const user = await completeMfaChallenge(getDb(), (await cookies()).get(MFA_COOKIE)?.value, String(code ?? ''));
  const { token } = await createSession(getDb(), user.id);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  res.cookies.set(MFA_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
