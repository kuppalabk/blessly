import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { route } from '@/server/http';
import { runJobsRecorded } from '@/server/services/jobs';
import { emailProviderFromEnv } from '@/server/providers/email';

/** Called every minute by a hosted scheduler: Authorization: Bearer $CRON_SECRET */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const ok = secret.length >= 8 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) throw new AppError(401, 'unauthorized', 'Unauthorized');
  return NextResponse.json(await runJobsRecorded(getDb(), emailProviderFromEnv()));
}
export const GET = route(handle);
export const POST = route(handle);
export const dynamic = 'force-dynamic';
