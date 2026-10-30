import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deleteEvent, getEvent, updateEvent } from '@/server/services/family';

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json(await getEvent(getDb(), u.id, (await params).id, u.timezone));
});
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ event: await updateEvent(getDb(), u.id, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json(await deleteEvent(getDb(), u.id, (await params).id));
});
