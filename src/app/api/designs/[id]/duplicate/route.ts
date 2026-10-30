import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { duplicateDesign } from '@/server/services/designs';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  return NextResponse.json({ design: await duplicateDesign(getDb(), u.id, (await params).id) }, { status: 201 });
});
