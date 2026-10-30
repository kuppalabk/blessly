import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { revokeInvite } from '@/server/services/family';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) => {
  const u = await requireUser();
  const p = await params;
  await revokeInvite(getDb(), u.id, p.id, p.inviteId);
  return NextResponse.json({ ok: true });
});
