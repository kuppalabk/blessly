import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { audienceSize, createCampaign, listCampaigns, requireBusiness } from '@/server/services/business';

export const GET = route(async (req: Request) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  const tag = new URL(req.url).searchParams.get('audience');
  if (tag !== null) return NextResponse.json({ audience: await audienceSize(getDb(), b.id, tag.trim().toLowerCase()) });
  return NextResponse.json({ campaigns: await listCampaigns(getDb(), b.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json({ campaign: await createCampaign(getDb(), b, await readJson(req)) }, { status: 201 });
});
