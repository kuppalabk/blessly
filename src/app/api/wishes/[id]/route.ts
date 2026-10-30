import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { getWish } from '@/server/services/wishes';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json(await getWish(getDb(), u.id, (await params).id));
});
