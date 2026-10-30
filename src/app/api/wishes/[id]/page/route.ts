import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route } from '@/server/http';
import { publishWishPage } from '@/server/services/wishes';

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const u = await requireUser();
  const page = await publishWishPage(getDb(), u.id, (await params).id);
  return NextResponse.json({ page, url: `${process.env.APP_URL ?? ''}/w/${page.slug}` });
});
