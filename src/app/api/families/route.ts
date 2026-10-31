import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createFamily, listFamilies } from '@/server/services/family';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ families: await listFamilies(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ family: await createFamily(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
