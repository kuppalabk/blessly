import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
const app = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;
type P = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json({ celebration: await S.cancelCelebration(getDb(), u.id, (await params).id, await readJson(req), emailProviderFromEnv(), app(req)) });
});
