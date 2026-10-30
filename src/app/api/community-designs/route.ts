import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

export const GET = route(async (req: Request) => {
  await requireUser();
  return NextResponse.json({ designs: await M.communityDesignList(getDb(), new URL(req.url).searchParams.get('occasion') ?? undefined) });
});
