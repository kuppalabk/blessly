import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { readJson, requireUser, route } from '@/server/http';
import { pushProviderFromEnv } from '@/server/providers/push';
import { deviceCount, subscribe, unsubscribe } from '@/server/services/push';
import { z } from 'zod';

/** The VAPID public key the browser needs to subscribe (null when push isn't configured). */
export const GET = route(async () => {
  const u = await requireUser();
  return NextResponse.json({ publicKey: pushProviderFromEnv()?.publicKey ?? null, devices: await deviceCount(getDb(), u.id) });
});
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await subscribe(getDb(), u.id, await readJson(req), req.headers.get('user-agent'));
  return NextResponse.json({ ok: true, devices: await deviceCount(getDb(), u.id) }, { status: 201 });
});
export const DELETE = route(async (req: Request) => {
  const u = await requireUser();
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await readJson(req));
  await unsubscribe(getDb(), u.id, endpoint);
  return NextResponse.json({ ok: true, devices: await deviceCount(getDb(), u.id) });
});
