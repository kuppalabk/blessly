import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { grantPlan, revokeGrant } from '@/server/services/billing';

type Ctx = { params: Promise<{ id: string }> };
/** Give a plan without payment. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const u = await currentUser();
  assertAdmin(u);
  await grantPlan(getDb(), u, (await params).id, await readJson(req));
  return NextResponse.json({ ok: true });
});
/** End a manual grant. Body: { subscriptionId } */
export const DELETE = route(async (req: Request) => {
  const u = await currentUser();
  assertAdmin(u);
  const { subscriptionId } = (await readJson(req)) as { subscriptionId: string };
  await revokeGrant(getDb(), u, String(subscriptionId ?? ''));
  return NextResponse.json({ ok: true });
});
