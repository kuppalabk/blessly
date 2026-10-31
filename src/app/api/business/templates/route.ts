import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { listTemplates, requireBusiness, syncTemplates } from '@/server/services/business';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ templates: await listTemplates(getDb(), (await requireBusiness(getDb(), u.id)).id) });
});
/** Refresh from Meta. */
export const POST = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ templates: await syncTemplates(getDb(), u.id) });
});
