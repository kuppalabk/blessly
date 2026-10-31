import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { updatePlan } from '@/server/services/billing';

export const PUT = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await currentUser();
  assertAdmin(u);
  return NextResponse.json({ plan: await updatePlan(getDb(), u, (await params).id, await readJson(req)) });
});
