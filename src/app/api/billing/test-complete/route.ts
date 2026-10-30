import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { completeTestCheckout } from '@/server/services/billing';

/** Test mode only (BILLING_TEST_MODE=1): the fake checkout page pays or fails. */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const { subscriptionId, success } = z.object({ subscriptionId: z.string().uuid(), success: z.boolean() }).parse(await readJson(req));
  await completeTestCheckout(getDb(), u.id, subscriptionId, success);
  return NextResponse.json({ ok: true });
});
