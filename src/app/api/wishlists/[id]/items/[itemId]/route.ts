import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ id: string; itemId: string }> };
export const PUT = route(async (req: Request, { params }: P) => {
  const u = await requireUser(); const p = await params;
  const body = (await readJson(req)) as { move?: string };
  if (body.move === 'up' || body.move === 'down') { await L.moveItem(getDb(), u.id, p.id, p.itemId, body.move); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ item: await L.updateItem(getDb(), u.id, p.id, p.itemId, body) });
});
export const DELETE = route(async (_r: Request, { params }: P) => {
  const u = await requireUser(); const p = await params;
  await L.deleteItem(getDb(), u.id, p.id, p.itemId);
  return NextResponse.json({ ok: true });
});
