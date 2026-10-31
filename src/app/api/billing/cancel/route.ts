import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { cancelSubscription } from '@/server/services/billing';

export const POST = route(async () => {
  const u = await requireUser();
  const s = await cancelSubscription(getDb(), u.id);
  return NextResponse.json({ cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd });
});
