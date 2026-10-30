import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clearSessionCookie, readJson, requireUser, route } from '@/server/http';
import { deleteOwnAccount } from '@/server/services/account';
import { updateSettings } from '@/server/services/auth';

export const GET = route(async () => NextResponse.json({ user: await requireUser() }));
export const PATCH = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ user: await updateSettings(getDb(), u.id, await readJson(req)) });
});
/** Permanently deletes the account. Body: { password, confirm: "DELETE" }. */
export const DELETE = route(async (req: Request) => {
  const u = await requireUser();
  await deleteOwnAccount(getDb(), u.id, await readJson(req));
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
