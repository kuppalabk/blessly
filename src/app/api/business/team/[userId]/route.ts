import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { removeStaff } from '@/server/services/business';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  const u = await requireUser();
  await removeStaff(getDb(), u.id, (await params).userId);
  return NextResponse.json({ ok: true });
});
