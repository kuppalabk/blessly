import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { currentUser, rateLimit, readJson, requireUser, route, clientIp, readFormLimited } from '@/server/http';
import { emailProviderFromEnv } from '@/server/providers/email';
import * as S from '@/server/services/celebrations';
type P = { params: Promise<{ slug: string }> };
import { AppError } from '@/server/errors';
/** A guest message, optionally with one photo or video (multipart: name, message, token, file). */
export const POST = route(async (req: Request, { params }: P) => {
  await rateLimit(`celpost:${clientIp(req)}`, 40, 60 * 60000);
  const form = await readFormLimited(req, 41 * 1024 * 1024).catch((e) => { throw e instanceof AppError && e.status === 413 ? new AppError(413, 'too_large', 'Videos can be up to 40 MB') : e; });
  const file = form.get('file');
  const viewer = await currentUser();
  const post = await S.addPost(getDb(), (await params).slug, String(form.get('token') ?? '') || null, { name: String(form.get('name') ?? ''), message: String(form.get('message') ?? '') },
    file instanceof File && file.size ? { data: Buffer.from(await file.arrayBuffer()), type: file.type } : null, viewer?.id ?? null);
  return NextResponse.json({ post: { id: post.id, approved: post.approved } }, { status: 201 });
});
