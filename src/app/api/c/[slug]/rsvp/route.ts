import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ slug: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  await rateLimit(`rsvp:${clientIp(req)}`, 30, 60 * 60000);
  const body = (await readJson(req)) as { token?: string };
  const viewer = await currentUser();
  return NextResponse.json(await S.rsvp(getDb(), (await params).slug, body.token ?? null, body, viewer?.id ?? null));
});
