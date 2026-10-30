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
import { setQuota } from '@/server/services/admin';

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await admin();
  await setQuota(getDb(), a, (await params).id, await readJson(req));
  return NextResponse.json({ ok: true });
});
