import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
const app = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;
type P = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  await rateLimit(`invite:${u.id}`, 20, 60 * 60000);
  const body = (await readJson(req)) as { guestIds?: string[] };
  return NextResponse.json(await S.sendInvitations(getDb(), u.id, (await params).id, emailProviderFromEnv(), app(req), Array.isArray(body.guestIds) ? body.guestIds.slice(0, 500) : undefined));
});
