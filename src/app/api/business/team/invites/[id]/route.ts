import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { revokeStaffInvite } from '@/server/services/business';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  await revokeStaffInvite(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
