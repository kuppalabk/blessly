import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createDesign, listDesigns } from '@/server/services/designs';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ designs: await listDesigns(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ design: await createDesign(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
