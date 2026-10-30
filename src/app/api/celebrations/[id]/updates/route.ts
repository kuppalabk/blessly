import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
const app = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;
type P = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  await rateLimit(`celupdate:${u.id}`, 20, 60 * 60000);
  return NextResponse.json({ update: await S.postUpdate(getDb(), u.id, (await params).id, await readJson(req), emailProviderFromEnv(), app(req)) }, { status: 201 });
});
