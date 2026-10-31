import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deleteDesign, getDesign, updateDesign } from '@/server/services/designs';

type P = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json({ design: await getDesign(getDb(), u.id, (await params).id) });
});
export const PUT = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json({ design: await updateDesign(getDb(), u.id, (await params).id, await readJson(req, 450_000)) });
});
export const DELETE = route(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  await deleteDesign(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
