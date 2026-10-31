import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route } from '@/server/http';
import { logIn } from '@/server/services/auth';
import { finishSignIn } from '@/server/signin-flow';

export const POST = route(async (req: Request) => {
  const body = (await readJson(req)) as { email?: string; password?: string };
  await rateLimit(`login:${clientIp(req)}`, 20, 15 * 60000);
  await rateLimit(`login:${String(body.email ?? '').toLowerCase()}`, 10, 15 * 60000);
  const user = await logIn(getDb(), body.email ?? '', body.password ?? '');
  const res = NextResponse.json({ user: { id: user.id, name: user.name } });
  if ((await finishSignIn(getDb(), user.id, res)) === 'mfa') return NextResponse.json({ mfa: true }, { headers: res.headers });
  return res;
});
