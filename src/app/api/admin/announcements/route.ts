import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { sendAnnouncement } from '@/server/services/content';

export const POST = route(async (req: Request) => {
  const u = await currentUser(); assertAdmin(u);
  return NextResponse.json({ announcement: await sendAnnouncement(getDb(), u, await readJson(req)) }, { status: 201 });
});
