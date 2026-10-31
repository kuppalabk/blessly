import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { clientIp, rateLimit, readFormLimited, route } from '@/server/http';
import { addGuestPhoto, MAX_UPLOAD_BYTES } from '@/server/services/albums';

/** Public: a guest adds a photo to a shared album (only if the owner allows it). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await rateLimit(`guest-upload:${clientIp(req)}`, 30, 60 * 60000);
  const form = await readFormLimited(req, MAX_UPLOAD_BYTES + 100_000).catch((e) => { throw e instanceof AppError && e.status === 413 ? new AppError(413, 'too_large', 'Photos can be up to 15 MB') : e; });
  const file = form.get('photo');
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'Choose a photo');
  const photo = await addGuestPhoto(getDb(), (await params).slug, form.get('name'), { data: Buffer.from(await file.arrayBuffer()), type: file.type });
  return NextResponse.json({ photo: { id: photo.id, thumbUrl: photo.thumbUrl } }, { status: 201 });
});
