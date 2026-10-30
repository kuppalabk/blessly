import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { sessions, users } from '../schema';
import { AppError } from '../errors';
import { isValidTimezone } from '@/lib/dates';
import { LANGUAGES } from '@/lib/i18n-data';

export const SESSION_DAYS = 30;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone').default('Asia/Kolkata'),
  country: z.string().length(2).toUpperCase().default('IN'),
  language: z.enum(languageCodes).default('en')
});

export type PublicUser = { id: string; email: string; name: string; language: string; country: string; timezone: string; role: string;
  /** Two-step verification is on. */
  mfa?: boolean;
  /** Present during an admin's read-only support view: the admin's email. */
  viewedBy?: string };

export function toPublic(u: typeof users.$inferSelect): PublicUser {
  return { id: u.id, email: u.email, name: u.name, language: u.language, country: u.country, timezone: u.timezone, role: u.role, mfa: !!u.totpEnabledAt };
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function signUp(db: DB, raw: unknown): Promise<PublicUser> {
  const input = signUpSchema.parse(raw);
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw new AppError(409, 'email_taken', 'An account with this email already exists');
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [u] = await db.insert(users).values({ ...input, passwordHash, lastSeenAt: new Date() }).returning();
  return toPublic(u);
}

export async function logIn(db: DB, emailRaw: string, password: string): Promise<PublicUser> {
  const email = String(emailRaw ?? '').trim().toLowerCase();
  const u = await db.query.users.findFirst({ where: eq(users.email, email) });
  const ok = await bcrypt.compare(String(password ?? ''), u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) throw new AppError(401, 'bad_credentials', 'Email or password is incorrect');
  // Only revealed after the right password, so it can't be used to discover accounts.
  if (u.suspendedAt) throw new AppError(403, 'suspended', 'This account is suspended. Please contact support.');
  return toPublic(u);
}

export async function createSession(db: DB, userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // opportunistic clean-up of this user's expired sessions
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
  return { token, expiresAt };
}

export async function userFromSession(db: DB, token: string | undefined, now = new Date()): Promise<PublicUser | null> {
  if (!token || token.length > 100) return null;
  const s = await db.query.sessions.findFirst({ where: and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)) });
  if (!s) return null;
  const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
  if (!u || u.suspendedAt) return null;
  if (s.impersonatorId) {
    // Support view: only valid while the admin is still an active admin. Never counts as the user being active.
    const admin = await db.query.users.findFirst({ where: eq(users.id, s.impersonatorId) });
    if (!admin || admin.role !== 'admin' || admin.suspendedAt) return null;
    return { ...toPublic(u), viewedBy: admin.email };
  }
  if (!u.lastSeenAt || now.getTime() - u.lastSeenAt.getTime() > 10 * 60000) {
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, u.id));
  }
  return toPublic(u);
}

export async function deleteSession(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone').optional(),
  country: z.string().length(2).toUpperCase().optional(),
  language: z.enum(languageCodes).optional()
});

export async function updateSettings(db: DB, userId: string, raw: unknown): Promise<PublicUser> {
  const input = settingsSchema.parse(raw);
  const [u] = await db.update(users).set(input).where(eq(users.id, userId)).returning();
  return toPublic(u);
}
