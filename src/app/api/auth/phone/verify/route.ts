import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route } from '@/server/http';
import { verifyPhoneLogin } from '@/server/services/signin';
import { finishSignIn } from '@/server/signin-flow';

export const POST = route(async (req: Request) => {
  await rateLimit(`sms-verify:${clientIp(req)}`, 30, 15 * 60000);
  const { token, code } = (await readJson(req)) as { token?: string; code?: string };
  const user = await verifyPhoneLogin(getDb(), String(token ?? ''), String(code ?? ''));
  const res = NextResponse.json({ ok: true });
  if ((await finishSignIn(getDb(), user.id, res)) === 'mfa') return NextResponse.json({ mfa: true }, { headers: res.headers });
  return res;
});
