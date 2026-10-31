import { NextResponse } from 'next/server';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { AppError } from '@/server/errors';
import { SETTINGS, type Group } from '@/server/settings';
import { testGroup } from '@/server/integration-tests';

/** Runs a read-only connection check for one integration group. Body: { group }. */
export const POST = route(async (req: Request) => {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin-test:${u.id}`, 30, 60000);
  const { group } = (await readJson(req)) as { group?: unknown };
  if (typeof group !== 'string' || !SETTINGS.some((s) => s.group === group)) throw new AppError(400, 'bad_group', 'Unknown group');
  return NextResponse.json(await testGroup(group as Group));
});
