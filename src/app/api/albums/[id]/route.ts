import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deleteAlbum, getAlbum, updateAlbum } from '@/server/services/albums';

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json(await getAlbum(getDb(), u.id, (await params).id));
});
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ album: await updateAlbum(getDb(), u.id, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  await deleteAlbum(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
