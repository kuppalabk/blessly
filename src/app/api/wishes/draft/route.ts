import { NextResponse } from 'next/server';
import { readJson, rateLimit, requireUser, route } from '@/server/http';
import { draftWish } from '@/server/services/wishes';

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`draft:${u.id}`, 60, 60 * 60000);
  return NextResponse.json({ draft: await draftWish(await readJson(req)) });
});
