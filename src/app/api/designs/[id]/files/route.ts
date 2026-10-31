import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, readFormLimited, requireUser, route } from '@/server/http';
import { addCardPhoto, getDesign, MAX_CARD_PHOTO_BYTES } from '@/server/services/designs';

/** Upload a photo to use on this card (multipart field "photo"). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  await getDesign(getDb(), u.id, (await params).id);
  await rateLimit(`upload:${u.id}`, 300, 60 * 60000);
  const form = await readFormLimited(req, MAX_CARD_PHOTO_BYTES + 100_000).catch((e) => { throw e instanceof AppError && e.status === 413 ? new AppError(413, 'too_large', 'Photos can be up to 15 MB') : e; });
  const file = form.get('photo');
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'Choose a photo');
  return NextResponse.json({ file: await addCardPhoto(getDb(), u.id, { data: Buffer.from(await file.arrayBuffer()), type: file.type }) }, { status: 201 });
});
