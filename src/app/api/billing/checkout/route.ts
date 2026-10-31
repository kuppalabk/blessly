import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import { startCheckout } from '@/server/services/billing';

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`checkout:${u.id}`, 10, 10 * 60000);
  return NextResponse.json(await startCheckout(getDb(), u, await readJson(req), process.env.APP_URL ?? new URL(req.url).origin));
});
