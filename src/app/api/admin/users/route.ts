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
import { listUsers } from '@/server/services/admin';

export const GET = route(async (req: Request) => {
  await admin();
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(await listUsers(getDb(), { q: sp.get('q') ?? undefined, filter: sp.get('filter') ?? undefined, offset: Number(sp.get('offset')) || 0 }));
});
