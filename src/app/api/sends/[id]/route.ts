import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { cancelSend } from '@/server/services/wishes';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json({ send: await cancelSend(getDb(), u.id, (await params).id) });
});
