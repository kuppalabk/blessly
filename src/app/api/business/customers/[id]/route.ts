import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { deleteCustomer, getCustomer, requireBusiness, updateCustomer } from '@/server/services/business';

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  return NextResponse.json({ customer: await getCustomer(getDb(), (await requireBusiness(getDb(), u.id)).id, (await params).id) });
});
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json({ customer: await updateCustomer(getDb(), b, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await requireUser();
  await deleteCustomer(getDb(), (await requireBusiness(getDb(), u.id)).id, (await params).id);
  return NextResponse.json({ ok: true });
});
