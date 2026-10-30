import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ slug: string }> };
export const POST = route(async (req: Request, { params }: P) => {
  await rateLimit(`reserve:${clientIp(req)}`, 40, 60 * 60000);
  const body = (await readJson(req)) as { itemId?: string };
  const viewer = await currentUser();
  return NextResponse.json(await L.reserveItem(getDb(), (await params).slug, String(body.itemId ?? ''), body, viewer?.id ?? null), { status: 201 });
});
