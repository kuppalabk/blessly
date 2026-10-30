import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route, rateLimit } from '@/server/http';
import { affiliateDashboard, joinAffiliate } from '@/server/services/promotions';

export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ dashboard: await affiliateDashboard(getDb(), u.id) });
});

/** Applies to the partner programme. The application is reviewed before the code works. */
export const POST = route(async () => {
  const u = await requireUser();
  await rateLimit(`affiliate-join:${u.id}`, 5, 60 * 60000);
  const a = await joinAffiliate(getDb(), { id: u.id, name: u.name });
  return NextResponse.json({ affiliate: { status: a.status, code: a.code } }, { status: 201 });
});
