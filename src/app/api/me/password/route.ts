import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { rateLimit, readJson, requireUser, route } from '@/server/http';
import { users } from '@/server/schema';

/** Change (or, for Google/Apple/phone accounts, set) a password. */
export const POST = route(async (req: Request) => {
  const u = await requireUser();
  await rateLimit(`password:${u.id}`, 10, 15 * 60000);
  const { current, next } = z.object({ current: z.string().default(''), next: z.string().min(8, 'Use at least 8 characters').max(200) }).parse(await readJson(req));
  const row = (await getDb().query.users.findFirst({ where: eq(users.id, u.id) }))!;
  if (row.passwordHash && !(await bcrypt.compare(current, row.passwordHash))) throw new AppError(401, 'bad_password', 'Your current password isn’t right');
  await getDb().update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, u.id));
  return NextResponse.json({ ok: true });
});
