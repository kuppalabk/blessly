import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, currentUser, rateLimit, readFormLimited, readJson, requireUser, route } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as M from '@/server/services/marketplace';
import * as $ from '@/server/services/money';

/** A designer submits a card design (multipart: title, occasion, image). */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`upload:${u.id}`, 300, 60 * 60000);
  const form = await readFormLimited(req, 20 * 1024 * 1024);
  const f = form.get('image');
  if (!(f instanceof File)) throw new AppError(400, 'no_file', 'Choose an image');
  return NextResponse.json({ design: await M.submitDesign(getDb(), u.id, { title: form.get('title'), occasion: form.get('occasion') }, { data: Buffer.from(await f.arrayBuffer()) }) }, { status: 201 });
});
