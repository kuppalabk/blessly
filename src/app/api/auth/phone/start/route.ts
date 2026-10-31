import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route } from '@/server/http';
import { cleanPhone, startPhoneLogin } from '@/server/services/signin';

export const POST = route(async (req: Request) => {
  const body = (await readJson(req)) as { phone?: string; country?: string };
  await rateLimit(`sms-ip:${clientIp(req)}`, 10, 60 * 60000);
  await rateLimit(`sms-phone:${cleanPhone(body.phone, body.country)}`, 5, 60 * 60000);
  return NextResponse.json(await startPhoneLogin(getDb(), body));
});
