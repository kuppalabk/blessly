import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route, rateLimit } from '@/server/http';
import { quoteOrder } from '@/server/services/marketplace';

/** Shows the price with a code before paying. Body: { code, purpose, productId?, quantity?, currency?, value? }. */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`promo-quote:${u.id}`, 60, 60000);
  return NextResponse.json(await quoteOrder(getDb(), u, await readJson(req)));
});
