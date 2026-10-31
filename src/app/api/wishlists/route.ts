import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ wishlists: await L.listWishlists(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  return NextResponse.json({ wishlist: await L.createWishlist(getDb(), u.id, await readJson(req)) }, { status: 201 });
});
