import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { createCustomer, listCustomers, requireBusiness } from '@/server/services/business';

export const GET = route(async (req: Request) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(await listCustomers(getDb(), b.id, { q: sp.get('q') ?? undefined, tag: sp.get('tag') ?? undefined, offset: Number(sp.get('offset')) || 0 }));
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json({ customer: await createCustomer(getDb(), b, await readJson(req)) }, { status: 201 });
});
