import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { updatePromo } from '@/server/services/promotions';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  const p = await updatePromo(getDb(), { id: u.id, email: u.email }, (await params).id, await readJson(req));
  return NextResponse.json({ promo: p });
});
