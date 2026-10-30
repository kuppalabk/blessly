import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { markCommissionsPaid } from '@/server/services/promotions';

type Ctx = { params: Promise<{ id: string }> };

/** Records that the pending commissions were paid. Body: { reference }. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return NextResponse.json(await markCommissionsPaid(getDb(), { id: u.id, email: u.email }, (await params).id, await readJson(req)));
});
