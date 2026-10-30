import { NextResponse } from 'next/server';
import { currentUser, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { listSettings } from '@/server/settings';

async function admin() {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return u;
}

/** Every integration key with its masked preview. Secret values are never returned. */
export const GET = route(async () => {
  await admin();
  return NextResponse.json({ settings: await listSettings() });
});
