import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, readJson, route } from '@/server/http';
import { requestPasswordReset } from '@/server/services/account';
import { emailProviderFromEnv } from '@/server/providers/email';

/** Always answers the same way, whether or not the email has an account. */
export const POST = route(async (req: Request) => {
  const body = (await readJson(req)) as { email?: string };
  await rateLimit(`forgot:${clientIp(req)}`, 10, 15 * 60000);
  await rateLimit(`forgot:${String(body.email ?? '').toLowerCase()}`, 3, 15 * 60000);
  await requestPasswordReset(getDb(), emailProviderFromEnv(), body.email ?? '', process.env.APP_URL ?? new URL(req.url).origin);
  return NextResponse.json({ ok: true });
});
