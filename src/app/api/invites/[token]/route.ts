import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, rateLimit, requireUser, route } from '@/server/http';
import { acceptInvite, previewInvite } from '@/server/services/family';

type Ctx = { params: Promise<{ token: string }> };
export const GET = route(async (req: Request, { params }: Ctx) => {
  await rateLimit(`invite:${clientIp(req)}`, 30, 10 * 60000);
  const u = await requireUser();
  return NextResponse.json(await previewInvite(getDb(), (await params).token, u.id));
});
export const POST = route(async (req: Request, { params }: Ctx) => {
  await rateLimit(`invite:${clientIp(req)}`, 30, 10 * 60000);
  const u = await requireUser();
  return NextResponse.json(await acceptInvite(getDb(), u.id, (await params).token));
});
