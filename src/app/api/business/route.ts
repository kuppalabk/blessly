import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createBusiness, getMyBusiness, publicBusiness, updateBusiness } from '@/server/services/business';

export const GET = route(async () => {
  const u = await requireUser();
  const b = await getMyBusiness(getDb(), u.id);
  return NextResponse.json({ business: b ? publicBusiness(b) : null });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ business: publicBusiness(await createBusiness(getDb(), u.id, await readJson(req))) }, { status: 201 });
});
export const PATCH = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ business: publicBusiness(await updateBusiness(getDb(), u.id, await readJson(req))) });
});
