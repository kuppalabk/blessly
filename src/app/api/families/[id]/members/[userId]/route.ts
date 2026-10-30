import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { removeMember, updateMember } from '@/server/services/family';

type Ctx = { params: Promise<{ id: string; userId: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  const p = await params;
  return NextResponse.json({ member: await updateMember(getDb(), u.id, p.id, p.userId, await readJson(req)) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  const p = await params;
  return NextResponse.json(await removeMember(getDb(), u.id, p.id, p.userId));
});
