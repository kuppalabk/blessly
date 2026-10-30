import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json(await L.thankGivers(getDb(), u.id, (await params).id, await readJson(req), emailProviderFromEnv()));
});
