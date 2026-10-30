import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, readFormLimited, requireUser, route } from '@/server/http';
import { addPhoto, MAX_UPLOAD_BYTES } from '@/server/services/albums';

/** Upload one photo (multipart form field "photo"). The app uploads several one after another. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  await rateLimit(`upload:${u.id}`, 300, 60 * 60000);
  const form = await readFormLimited(req, MAX_UPLOAD_BYTES + 100_000).catch((e) => { throw e instanceof AppError && e.status === 413 ? new AppError(413, 'too_large', 'Photos can be up to 15 MB') : e; });
  const file = form.get('photo');
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'Choose a photo');
  const photo = await addPhoto(getDb(), u.id, (await params).id, { data: Buffer.from(await file.arrayBuffer()), type: file.type });
  return NextResponse.json({ photo }, { status: 201 });
});
