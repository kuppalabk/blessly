import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deletePhoto, updatePhoto } from '@/server/services/albums';

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ photo: await updatePhoto(getDb(), u.id, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  await deletePhoto(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
