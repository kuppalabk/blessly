import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, readBodyLimited, requireUser, route } from '@/server/http';
import { MAX_RENDER_BYTES, setRender } from '@/server/services/designs';

/** The browser uploads the finished picture of a page (PNG body) so the wish page and prints match the editor exactly. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  await rateLimit(`render:${u.id}`, 240, 60 * 60000);
  const page = new URL(req.url).searchParams.get('page');
  if (page !== 'front' && page !== 'inside') throw new AppError(400, 'bad_page', 'Choose front or inside');
  const body = await readBodyLimited(req, MAX_RENDER_BYTES);
  return NextResponse.json({ file: await setRender(getDb(), u.id, (await params).id, page, body) }, { status: 201 });
});
