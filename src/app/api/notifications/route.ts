import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { listNotifications, markRead, unreadCount } from '@/server/services/home';

export const GET = route(async (req: Request) => {
  const u = await requireUser();
  // Optional ?limit=N (1 to 100, default 30).
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 30));
  return NextResponse.json({ notifications: await listNotifications(getDb(), u.id, limit), unread: await unreadCount(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  const body = (await readJson(req)) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : 'all';
  await markRead(getDb(), u.id, ids);
  return NextResponse.json({ ok: true });
});
