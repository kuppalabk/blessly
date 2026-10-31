import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { cancelCampaign, requireBusiness } from '@/server/services/business';

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json({ campaign: await cancelCampaign(getDb(), b.id, (await params).id) });
});
