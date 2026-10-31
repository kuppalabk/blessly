import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const body = (await readJson(req, 200_000)) as { guests?: unknown };
  return NextResponse.json({ guests: await S.addGuests(getDb(), u.id, (await params).id, body.guests) }, { status: 201 });
});
