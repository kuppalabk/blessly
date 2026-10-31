import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { startGroupCard } from '@/server/services/family';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json(await startGroupCard(getDb(), u, (await params).id), { status: 201 });
});
