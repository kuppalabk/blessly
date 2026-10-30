import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { requireBusiness, updateAutomation } from '@/server/services/business';

export const PUT = route(async (req: Request, { params }: { params: Promise<{ kind: string }> }) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json({ automation: await updateAutomation(getDb(), b, (await params).kind, await readJson(req)) });
});
