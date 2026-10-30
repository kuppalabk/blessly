import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { approvedCharities } from '@/server/services/marketplace';

/** Verified charities a fundraiser can send money to. */
export const GET = route(async () => {
  await requireUser();
  return NextResponse.json({ charities: await approvedCharities(getDb()) });
});
