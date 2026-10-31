import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { connectWhatsApp, disconnectWhatsApp, publicBusiness } from '@/server/services/business';

export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ business: publicBusiness(await connectWhatsApp(getDb(), u.id, await readJson(req))) });
});
export const DELETE = route(async () => {
  const u = await requireUser();
  await disconnectWhatsApp(getDb(), u.id);
  return NextResponse.json({ ok: true });
});
