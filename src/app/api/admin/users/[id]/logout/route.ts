import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';

async function admin() {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return u;
}
import { logoutEverywhere } from '@/server/services/admin';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await admin();
  return NextResponse.json({ ended: await logoutEverywhere(getDb(), a, (await params).id) });
});
