import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { decideAffiliate } from '@/server/services/promotions';

type Ctx = { params: Promise<{ id: string }> };

/** Approve, pause or reject a partner, and set their commission. Body: { status, commissionPercent?, note? }. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  const a = await decideAffiliate(getDb(), { id: u.id, email: u.email }, (await params).id, await readJson(req));
  return NextResponse.json({ affiliate: { id: a.id, status: a.status, commissionPercent: a.commissionPercent } });
});
