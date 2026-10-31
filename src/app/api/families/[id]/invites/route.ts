import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createInvite } from '@/server/services/family';

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const inv = await createInvite(getDb(), u.id, (await params).id, await readJson(req));
  return NextResponse.json({ invite: { id: inv.id, token: inv.token, role: inv.role, expiresAt: inv.expiresAt } }, { status: 201 });
});
