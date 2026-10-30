import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ id: string }> };
export const GET = route(async (_r: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json(await L.ownerView(getDb(), u.id, (await params).id));
});
export const PUT = route(async (req: Request, { params }: P) => {
  const u = await requireUser();
  return NextResponse.json({ wishlist: await L.updateWishlist(getDb(), u.id, (await params).id, await readJson(req)) });
});
export const DELETE = route(async (_r: Request, { params }: P) => {
  const u = await requireUser();
  await L.deleteWishlist(getDb(), u.id, (await params).id);
  return NextResponse.json({ ok: true });
});
