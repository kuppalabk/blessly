import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, readFormLimited, requireUser, route } from '@/server/http';
import { addMessageRecording, MAX_VIDEO_BYTES } from '@/server/services/designs';

/** A recorded voice or video message (multipart: "media" file + "duration" seconds). */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`record:${u.id}`, 60, 60 * 60000);
  const form = await readFormLimited(req, MAX_VIDEO_BYTES + 100_000).catch((e) => { throw e instanceof AppError && e.status === 413 ? new AppError(413, 'too_large', 'Recordings can be up to 40 MB') : e; });
  const file = form.get('media');
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'Record a message first');
  const rec = await addMessageRecording(getDb(), u.id, { data: Buffer.from(await file.arrayBuffer()), type: file.type, durationSec: Number(form.get('duration')) });
  return NextResponse.json({ recording: rec }, { status: 201 });
});
