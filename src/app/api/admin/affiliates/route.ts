import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { listAffiliates } from '@/server/services/promotions';

export const GET = route(async () => {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return NextResponse.json({ affiliates: await listAffiliates(getDb()) });
});
