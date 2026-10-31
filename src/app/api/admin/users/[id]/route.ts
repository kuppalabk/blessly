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
import { adminDeleteUser, userDetail } from '@/server/services/admin';

type Ctx = { params: Promise<{ id: string }> };
export const GET = route(async (_req: Request, { params }: Ctx) => {
  await admin();
  return NextResponse.json(await userDetail(getDb(), (await params).id));
});
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const a = await admin();
  await adminDeleteUser(getDb(), a, (await params).id, await readJson(req));
  return NextResponse.json({ ok: true });
});
