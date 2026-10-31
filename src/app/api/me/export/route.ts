import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, requireUser, route } from '@/server/http';
import { exportUserData } from '@/server/services/account';

/** "Download my data" — a JSON file with everything Blessly stores about the user. */
export const GET = route(async () => {
  const u = await requireUser();
  if (u.viewedBy) throw new AppError(403, 'read_only', 'Data downloads aren’t available in a support view');
  await rateLimit(`export:${u.id}`, 5, 60 * 60000);
  const data = await exportUserData(getDb(), u.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="blessly-data-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' }
  });
});
