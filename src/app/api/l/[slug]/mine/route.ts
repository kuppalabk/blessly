import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ slug: string }> };
export const POST = route(async (req: Request) => {
  const body = (await readJson(req)) as { tokens?: unknown };
  return NextResponse.json({ reservations: await L.myReservations(getDb(), Array.isArray(body.tokens) ? body.tokens.map(String) : []) });
});
