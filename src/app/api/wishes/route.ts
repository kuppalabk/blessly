import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { listWishes, saveWish } from '@/server/services/wishes';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ wishes: await listWishes(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ wish: await saveWish(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
