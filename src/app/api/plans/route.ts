import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, route } from '@/server/http';
import { entitlements, listPlans } from '@/server/services/billing';

/** Plans and prices. Signed-in people also get their own entitlements (current plan and limits). */
export const GET = route(async () => {
  const db = getDb();
  const u = await currentUser();
  return NextResponse.json({
    plans: await listPlans(db),
    entitlements: u ? await entitlements(db, u.id) : null,
  });
});
