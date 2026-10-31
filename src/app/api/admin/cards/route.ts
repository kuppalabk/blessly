import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { setCardOverride } from '@/server/services/content';

export const PUT = route(async (req: Request) => {
  const u = await currentUser(); assertAdmin(u);
  await setCardOverride(getDb(), u, await readJson(req));
  return NextResponse.json({ ok: true });
});
