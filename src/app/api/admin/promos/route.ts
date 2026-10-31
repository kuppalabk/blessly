import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { createPromo, listPromos } from '@/server/services/promotions';

async function admin() {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return u;
}

export const GET = route(async () => {
  await admin();
  return NextResponse.json({ promos: await listPromos(getDb()) });
});

export const POST = route(async (req: Request) => {
  const a = await admin();
  const p = await createPromo(getDb(), { id: a.id, email: a.email }, await readJson(req));
  return NextResponse.json({ promo: p }, { status: 201 });
});
