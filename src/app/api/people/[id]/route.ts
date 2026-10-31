import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deletePerson, getVisiblePerson, updatePerson } from '@/server/services/people';

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ person: await getVisiblePerson(getDb(), u.id, (await params).id, u.timezone) });
});
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ person: await updatePerson(getDb(), u.id, (await params).id, await readJson(req), u.timezone) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  await deletePerson(getDb(), u.id, (await params).id, u.timezone);
  return NextResponse.json({ ok: true });
});
