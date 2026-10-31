import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { scheduleSend } from '@/server/services/wishes';

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json({ send: await scheduleSend(getDb(), u.id, (await params).id, await readJson(req), u.country) }, { status: 201 });
});
