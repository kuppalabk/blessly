import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { upcoming } from '@/server/services/home';

export const GET = route(async (req: Request) => {
  const u = await requireUser();
  // Optional ?days=N (1 to 400, default 60) for calendar views.
  const days = Math.min(400, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 60));
  return NextResponse.json({ items: await upcoming(getDb(), u, days) });
});
