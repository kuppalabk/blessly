import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { setRsvp } from '@/server/services/family';

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json(await setRsvp(getDb(), u.id, (await params).id, await readJson(req)));
});
