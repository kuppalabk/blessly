import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { currentUser, readJson, route } from '@/server/http';
import { LANG_COOKIE } from '@/server/i18n';
import { users } from '@/server/schema';
import { UI_LANGUAGES } from '@/lib/i18n/ui';

/** Changes the interface language (a cookie for visitors; the account setting when signed in). */
export const POST = route(async (req: Request) => {
  const { code } = (await readJson(req)) as { code?: string };
  if (!code || !UI_LANGUAGES.includes(code)) return NextResponse.json({ error: 'Unknown language' }, { status: 400 });
  const u = await currentUser();
  if (u && !u.viewedBy) await getDb().update(users).set({ language: code }).where(eq(users.id, u.id));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LANG_COOKIE, code, { path: '/', maxAge: 365 * 86400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res;
});
