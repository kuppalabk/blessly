import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createPerson, listPeople } from '@/server/services/people';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ people: await listPeople(getDb(), u.id, u.timezone) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ person: await createPerson(getDb(), u.id, await readJson(req), u.timezone) }, { status: 201 });
});
