import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { clientIp, currentUser, rateLimit, readJson, route } from '@/server/http';
import { addSignature } from '@/server/services/wishes';

/** Public: guests sign a wish page without an account. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await rateLimit(`sign:${clientIp(req)}`, 10, 10 * 60000);
  const user = await currentUser();
  const s = await addSignature(getDb(), (await params).slug, await readJson(req), user?.id ?? null);
  return NextResponse.json({ signature: { name: s.name, message: s.message } }, { status: 201 });
});
