import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as L from '@/server/services/wishlists';
type P = { params: Promise<{ id: string; itemId: string }> };
import { AppError } from '@/server/errors';
export const POST = route(async (req: Request, { params }: P) => {
  const u = await requireUser(); const p = await params;
  await rateLimit(`upload:${u.id}`, 300, 60 * 60000);
  const form = await readFormLimited(req, 15 * 1024 * 1024 + 100_000);
  const file = form.get('photo');
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'Choose a photo');
  return NextResponse.json({ imageUrl: await L.setItemPhoto(getDb(), u.id, p.id, p.itemId, { data: Buffer.from(await file.arrayBuffer()), type: file.type }) }, { status: 201 });
});
