import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`buy:${u.id}`, 30, 60 * 60000);
  return NextResponse.json(await M.buyGiftCard(getDb(), u, await readJson(req)), { status: 201 });
});
