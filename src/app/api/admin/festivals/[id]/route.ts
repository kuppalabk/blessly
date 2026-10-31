import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, route } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { deleteFestivalDate } from '@/server/services/content';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await currentUser(); assertAdmin(u);
  await deleteFestivalDate(getDb(), u, (await params).id);
  return NextResponse.json({ ok: true });
});
