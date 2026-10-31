import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, requireUser, route, readBodyLimited } from '@/server/http';
import { importCustomers, requireBusiness } from '@/server/services/business';

/** CSV import. Body: { csv: string, consent: boolean } (up to 2 MB). */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`import:${u.id}`, 10, 10 * 60000);
  const text = (await readBodyLimited(req, 2_200_000)).toString('utf8');
  if (text.length > 2_200_000) throw new AppError(413, 'too_large', 'The file is too big (2 MB max)');
  let json: unknown;
  try { json = JSON.parse(text || '{}'); } catch { throw new AppError(400, 'bad_json', 'Invalid JSON'); }
  const body = z.object({ csv: z.string(), consent: z.boolean() }).parse(json);
  const b = await requireBusiness(getDb(), u.id);
  return NextResponse.json(await importCustomers(getDb(), b, body.csv, { consent: body.consent }));
});
