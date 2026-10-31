import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { requireUser, route, rateLimit } from '@/server/http';
import { AppError } from '@/server/errors';
import { pushProviderFromEnv } from '@/server/providers/push';
import { pushToUser } from '@/server/services/push';

/** Sends a test notification to the user's devices right away. */
export const POST = route(async () => {
  const u = await requireUser();
  await rateLimit(`pushtest:${u.id}`, 5, 10 * 60000);
  const push = pushProviderFromEnv();
  if (!push) throw new AppError(503, 'push_off', 'Push notifications are not set up on this server');
  const r = await pushToUser(getDb(), push, u.id, { title: 'Blessly notifications are on', body: 'You’ll get reminders here before every birthday and family event.', url: '/notifications', tag: 'test' });
  return NextResponse.json(r);
});
