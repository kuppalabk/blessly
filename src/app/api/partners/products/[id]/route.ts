import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

export const PUT = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => { const u = await requireUser(); return NextResponse.json({ product: await M.updateProduct(getDb(), u.id, (await params).id, await readJson(req)) }); });
/** Product photo (multipart "photo"). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  await rateLimit(`upload:${u.id}`, 300, 60 * 60000);
  const form = await readFormLimited(req, 15 * 1024 * 1024 + 100_000);
  const f = form.get('photo');
  if (!(f instanceof File)) throw new AppError(400, 'no_file', 'Choose a photo');
  return NextResponse.json({ imageUrl: await M.setProductPhoto(getDb(), u.id, (await params).id, { data: Buffer.from(await f.arrayBuffer()) }) }, { status: 201 });
});
