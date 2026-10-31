import { NextResponse } from 'next/server';
import { currentUser, readJson, route, rateLimit } from '@/server/http';
import { assertAdmin } from '@/server/services/admin';
import { AppError } from '@/server/errors';
import { saveSetting } from '@/server/settings';

async function admin() {
  const u = await currentUser();
  assertAdmin(u);
  await rateLimit(`admin:${u.id}`, 300, 60000);
  return u;
}

type Ctx = { params: Promise<{ key: string }> };

/** Saves a key. The body is { value: string }. An empty value clears it. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const u = await admin();
  const body = (await readJson(req, 25_000)) as { value?: unknown };
  if (typeof body.value !== 'string') throw new AppError(400, 'bad_value', 'Enter a value');
  await saveSetting((await params).key, body.value, { id: u.id, email: u.email });
  return NextResponse.json({ ok: true });
});

/** Clears a key so the environment value (if any) is used again. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const u = await admin();
  await saveSetting((await params).key, '', { id: u.id, email: u.email });
  return NextResponse.json({ ok: true });
});
