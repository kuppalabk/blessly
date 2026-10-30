import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';

async function admin() {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return u;
}
import { suspendUser, unsuspendUser } from '@/server/services/admin';

type Ctx = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, { params }: Ctx) => {
  const a = await admin();
  await suspendUser(getDb(), a, (await params).id, await readJson(req));
  return NextResponse.json({ ok: true });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const a = await admin();
  await unsuspendUser(getDb(), a, (await params).id);
  return NextResponse.json({ ok: true });
});
