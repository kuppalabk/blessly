import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { acceptStaffInvite } from '@/server/services/business';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const u = await requireUser();
  return NextResponse.json(await acceptStaffInvite(getDb(), (await params).token, u));
});
