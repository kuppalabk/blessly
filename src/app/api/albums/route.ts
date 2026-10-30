import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createAlbum, listAlbums } from '@/server/services/albums';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ albums: await listAlbums(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ album: await createAlbum(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
