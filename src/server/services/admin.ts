import { cfg } from '../settings';
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import {
  adminAudit, bizMessages, businesses, customers, families, familyMembers, jobRuns, notifications, outbox, people, pushSubscriptions,
  reminders, scheduledSends, sessions, users, wishes, wishPages
} from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { createHash, randomBytes } from 'node:crypto';
import { deleteUserEverywhere } from './account';
import { monthStart, usedThisMonth } from './business';
import { businessAllowance } from './billing';
import type { PublicUser } from './auth';

const uuid = z.string().uuid();
type Admin = Pick<PublicUser, 'id' | 'email' | 'role'>;

/** Non-admins get "not found" so the admin area isn't advertised. */
export function assertAdmin(u: { role: string; mfa?: boolean } | null): asserts u is Admin {
  if (!u || u.role !== 'admin') throw notFound('Not found');
  // Admin powers need two-step verification (ADMIN_REQUIRE_2FA=0 turns this off for local development only).
  if (u.mfa === false && adminNeeds2fa()) throw new AppError(403, 'mfa_required', 'Turn on two-step verification in Settings to use the admin area');
}
export const adminNeeds2fa = () => process.env.ADMIN_REQUIRE_2FA !== '0' || process.env.NODE_ENV === 'production';

export async function audit(db: DB, admin: Admin, action: string, target: { type: string; id?: string | null; label?: string | null }, details?: string) {
  await db.insert(adminAudit).values({ adminId: admin.id, adminEmail: admin.email, action, targetType: target.type, targetId: target.id ?? null, targetLabel: target.label ?? null, details: details?.slice(0, 1000) ?? null });
}

/* ---------------- Dashboard ---------------- */

const DAY = 86400000;

export async function platformStats(db: DB, now = new Date()) {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const since7 = new Date(now.getTime() - 7 * DAY), since30 = new Date(now.getTime() - 30 * DAY);
  const [usersTotal, new7, new30, active7, active30, suspended, familiesTotal, businessesTotal, waConnected, wishesTotal, pagesTotal, pushDevices] = await Promise.all([
    n(db.select({ n: count() }).from(users)),
    n(db.select({ n: count() }).from(users).where(gte(users.createdAt, since7))),
    n(db.select({ n: count() }).from(users).where(gte(users.createdAt, since30))),
    n(db.select({ n: count() }).from(users).where(gte(users.lastSeenAt, since7))),
    n(db.select({ n: count() }).from(users).where(gte(users.lastSeenAt, since30))),
    n(db.select({ n: count() }).from(users).where(isNotNull(users.suspendedAt))),
    n(db.select({ n: count() }).from(families)),
    n(db.select({ n: count() }).from(businesses)),
    n(db.select({ n: count() }).from(businesses).where(isNotNull(businesses.waConnectedAt))),
    n(db.select({ n: count() }).from(wishes)),
    n(db.select({ n: count() }).from(wishPages)),
    n(db.select({ n: count() }).from(pushSubscriptions))
  ]);
  const month = monthStart(now);
  const biz = await db.select({ channel: bizMessages.channel, status: bizMessages.status, n: count() }).from(bizMessages)
    .where(gte(bizMessages.createdAt, month)).groupBy(bizMessages.channel, bizMessages.status);
  // Sign-ups per day for the last 14 days (UTC).
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 13 * DAY);
  const rows = await db.select({ day: sql<string>`to_char(${users.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`, n: count() }).from(users)
    .where(gte(users.createdAt, start)).groupBy(sql`1`);
  const signups = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, n: rows.find((r) => r.day === day)?.n ?? 0 };
  });
  return { usersTotal, new7, new30, active7, active30, suspended, familiesTotal, businessesTotal, waConnected, wishesTotal, pagesTotal, pushDevices, biz, signups };
}

/* ---------------- Users ---------------- */

export async function listUsers(db: DB, opts: { q?: string; filter?: string; offset?: number; limit?: number } = {}) {
  const conds = [];
  const q = opts.q?.trim();
  if (q) conds.push(or(ilike(users.email, `%${q.replace(/[%_]/g, '\\$&')}%`), ilike(users.name, `%${q.replace(/[%_]/g, '\\$&')}%`)));
  if (opts.filter === 'suspended') conds.push(isNotNull(users.suspendedAt));
  if (opts.filter === 'admins') conds.push(eq(users.role, 'admin'));
  if (opts.filter === 'business') conds.push(sql`exists (select 1 from ${businesses} where ${businesses.ownerId} = ${users.id})`);
  const where = conds.length ? and(...conds) : undefined;
  const list = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, country: users.country, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt, suspendedAt: users.suspendedAt })
    .from(users).where(where).orderBy(desc(users.createdAt)).limit(Math.min(opts.limit ?? 50, 200)).offset(opts.offset ?? 0);
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  return { users: list, total };
}

export async function userDetail(db: DB, userId: string, now = new Date()) {
  if (!uuid.safeParse(userId).success) throw notFound('User not found');
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw notFound('User not found');
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [peopleN, wishesN, sendsN, devices, activeSessions] = await Promise.all([
    c(db.select({ n: count() }).from(people).where(eq(people.userId, userId))),
    c(db.select({ n: count() }).from(wishes).where(eq(wishes.userId, userId))),
    c(db.select({ n: count() }).from(scheduledSends).where(eq(scheduledSends.userId, userId))),
    c(db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))),
    c(db.select({ n: count() }).from(sessions).where(and(eq(sessions.userId, userId), gte(sessions.expiresAt, now))))
  ]);
  const circles = await db.select({ id: families.id, name: families.name, role: familyMembers.role }).from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId)).where(eq(familyMembers.userId, userId));
  const b = await db.query.businesses.findFirst({ where: eq(businesses.ownerId, userId) });
  const history = await db.select().from(adminAudit).where(and(eq(adminAudit.targetType, 'user'), eq(adminAudit.targetId, userId))).orderBy(desc(adminAudit.createdAt)).limit(20);
  const { passwordHash: _ph, totpSecret: _ts, recoveryCodes: _rc, totpLastStep: _tl, ...safe } = u;
  void _ph;
  return {
    user: safe, counts: { people: peopleN, wishes: wishesN, scheduledSends: sendsN, pushDevices: devices, activeSessions },
    circles, business: b ? { id: b.id, name: b.name, pausedAt: b.pausedAt, waConnected: !!b.waConnectedAt, used: await usedThisMonth(db, b.id, now), quota: (await businessAllowance(db, b, now)).quota } : null,
    history
  };
}

const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason (it’s kept in the audit log)').max(300) });

async function targetUser(db: DB, admin: Admin, userId: string) {
  if (!uuid.safeParse(userId).success) throw notFound('User not found');
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw notFound('User not found');
  if (u.id === admin.id) throw badRequest('You can’t do this to your own account');
  if (u.role === 'admin') throw new AppError(403, 'forbidden', 'Admins can’t be changed from the admin screens. Use the command line.');
  return u;
}

/** Blocks login and ends every session. Their scheduled emails and business messages stop too. */
export async function suspendUser(db: DB, admin: Admin, userId: string, raw: unknown, now = new Date()) {
  const { reason } = reasonSchema.parse(raw);
  const u = await targetUser(db, admin, userId);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ suspendedAt: now, suspendedReason: reason }).where(eq(users.id, u.id));
    await tx.delete(sessions).where(eq(sessions.userId, u.id));
    await tx.update(scheduledSends).set({ status: 'cancelled', lastError: 'Account suspended' }).where(and(eq(scheduledSends.userId, u.id), eq(scheduledSends.status, 'scheduled')));
    await tx.update(businesses).set({ pausedAt: now, pausedReason: `Owner suspended: ${reason}` }).where(and(eq(businesses.ownerId, u.id), isNull(businesses.pausedAt)));
  });
  await audit(db, admin, 'user.suspend', { type: 'user', id: u.id, label: u.email }, reason);
}

export async function unsuspendUser(db: DB, admin: Admin, userId: string) {
  const u = await targetUser(db, admin, userId);
  if (!u.suspendedAt) throw badRequest('This account isn’t suspended');
  await db.update(users).set({ suspendedAt: null, suspendedReason: null }).where(eq(users.id, u.id));
  // A business paused only because of the suspension is resumed.
  await db.update(businesses).set({ pausedAt: null, pausedReason: null }).where(and(eq(businesses.ownerId, u.id), sql`${businesses.pausedReason} like 'Owner suspended:%'`));
  await audit(db, admin, 'user.unsuspend', { type: 'user', id: u.id, label: u.email });
}

export async function logoutEverywhere(db: DB, admin: Admin, userId: string) {
  const u = await targetUser(db, admin, userId);
  const gone = await db.delete(sessions).where(eq(sessions.userId, u.id)).returning({ id: sessions.id });
  await audit(db, admin, 'user.logout_all', { type: 'user', id: u.id, label: u.email }, `${gone.length} sessions ended`);
  return gone.length;
}

/** Permanent erasure (e.g. a deletion request that came in by email). The admin must type the email to confirm. */
export async function adminDeleteUser(db: DB, admin: Admin, userId: string, raw: unknown) {
  const { confirmEmail, reason } = z.object({ confirmEmail: z.string().trim().toLowerCase(), reason: reasonSchema.shape.reason }).parse(raw);
  const u = await targetUser(db, admin, userId);
  if (confirmEmail !== u.email) throw badRequest('Type the account’s email exactly to confirm');
  await deleteUserEverywhere(db, u.id);
  await audit(db, admin, 'user.delete', { type: 'user', id: u.id, label: u.email }, reason);
}

/* ---------------- Businesses ---------------- */

export async function listBusinesses(db: DB, opts: { q?: string; offset?: number } = {}, now = new Date()) {
  const q = opts.q?.trim();
  const where = q ? or(ilike(businesses.name, `%${q.replace(/[%_]/g, '\\$&')}%`), ilike(users.email, `%${q.replace(/[%_]/g, '\\$&')}%`)) : undefined;
  const list = await db.select({ b: businesses, ownerEmail: users.email, ownerName: users.name }).from(businesses)
    .innerJoin(users, eq(users.id, businesses.ownerId)).where(where).orderBy(desc(businesses.createdAt)).limit(50).offset(opts.offset ?? 0);
  if (!list.length) return [];
  const ids = list.map((r) => r.b.id);
  const custs = await db.select({ businessId: customers.businessId, n: count() }).from(customers).where(inArray(customers.businessId, ids)).groupBy(customers.businessId);
  const month = monthStart(now);
  const msgs = await db.select({ businessId: bizMessages.businessId, status: bizMessages.status, n: count() }).from(bizMessages)
    .where(and(inArray(bizMessages.businessId, ids), gte(bizMessages.createdAt, month))).groupBy(bizMessages.businessId, bizMessages.status);
  const out = [];
  for (const { b, ownerEmail, ownerName } of list) {
    const allowance = await businessAllowance(db, b, now);
    const mine = msgs.filter((m) => m.businessId === b.id);
    const sum = (ss: string[]) => mine.filter((m) => ss.includes(m.status)).reduce((a, m) => a + m.n, 0);
    out.push({
      id: b.id, name: b.name, ownerEmail, ownerName, country: b.country, createdAt: b.createdAt, pausedAt: b.pausedAt, pausedReason: b.pausedReason,
      waConnected: !!b.waConnectedAt, waDisplayNumber: b.waDisplayNumber, quota: allowance.quota, quotaSource: allowance.source, customQuota: b.monthlyQuota,
      customers: custs.find((c) => c.businessId === b.id)?.n ?? 0, sent: sum(['sent', 'delivered', 'read']), failed: sum(['failed'])
    });
  }
  return out;
}

async function targetBusiness(db: DB, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Business not found');
  const b = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
  if (!b) throw notFound('Business not found');
  return b;
}

export async function setQuota(db: DB, admin: Admin, businessId: string, raw: unknown) {
  // Empty = back to whatever the owner's plan includes.
  const { quota } = z.object({ quota: z.union([z.literal('').transform(() => null), z.null(), z.coerce.number().int().min(0).max(10_000_000)]) }).parse(raw);
  const b = await targetBusiness(db, businessId);
  await db.update(businesses).set({ monthlyQuota: quota }).where(eq(businesses.id, b.id));
  await audit(db, admin, 'business.quota', { type: 'business', id: b.id, label: b.name }, `${b.monthlyQuota ?? 'plan'} → ${quota ?? 'plan'}`);
}

/** Stops all sending for a business (e.g. complaints or WhatsApp quality warnings). Queued messages wait as "not sent". */
export async function pauseBusiness(db: DB, admin: Admin, businessId: string, raw: unknown, now = new Date()) {
  const { reason } = reasonSchema.parse(raw);
  const b = await targetBusiness(db, businessId);
  await db.update(businesses).set({ pausedAt: now, pausedReason: reason }).where(eq(businesses.id, b.id));
  await db.insert(notifications).values({ userId: b.ownerId, title: 'Your business messages are paused', body: `Blessly paused sending for ${b.name}: ${reason}. Reply to our email or contact support to resolve it.`, link: '/business' });
  await audit(db, admin, 'business.pause', { type: 'business', id: b.id, label: b.name }, reason);
}

export async function resumeBusiness(db: DB, admin: Admin, businessId: string) {
  const b = await targetBusiness(db, businessId);
  if (!b.pausedAt) throw badRequest('This business isn’t paused');
  await db.update(businesses).set({ pausedAt: null, pausedReason: null }).where(eq(businesses.id, b.id));
  await db.insert(notifications).values({ userId: b.ownerId, title: 'Your business messages are back on', body: `Sending for ${b.name} has resumed.`, link: '/business' });
  await audit(db, admin, 'business.resume', { type: 'business', id: b.id, label: b.name });
}

/* ---------------- System health ---------------- */

export async function systemHealth(db: DB, now = new Date()) {
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(15);
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const dayAgo = new Date(now.getTime() - DAY);
  const [remindersDue, sendsDue, bizQueued, bizFailed24h, sendsFailed30d, outbox24h] = await Promise.all([
    n(db.select({ n: count() }).from(reminders).where(and(eq(reminders.status, 'pending'), lt(reminders.dueAt, new Date(now.getTime() - 10 * 60000))))),
    n(db.select({ n: count() }).from(scheduledSends).where(and(eq(scheduledSends.status, 'scheduled'), lt(scheduledSends.sendAt, new Date(now.getTime() - 10 * 60000))))),
    n(db.select({ n: count() }).from(bizMessages).where(eq(bizMessages.status, 'queued'))),
    n(db.select({ n: count() }).from(bizMessages).where(and(eq(bizMessages.status, 'failed'), gte(bizMessages.updatedAt, dayAgo)))),
    n(db.select({ n: count() }).from(scheduledSends).where(and(eq(scheduledSends.status, 'failed'), gte(scheduledSends.createdAt, new Date(now.getTime() - 30 * DAY))))),
    n(db.select({ n: count() }).from(outbox).where(gte(outbox.createdAt, dayAgo)))
  ]);
  const last = runs[0];
  const minutesSinceRun = last ? Math.floor((now.getTime() - last.startedAt.getTime()) / 60000) : null;
  const recentFailures = await db.select({ m: bizMessages, business: businesses.name }).from(bizMessages).innerJoin(businesses, eq(businesses.id, bizMessages.businessId))
    .where(eq(bizMessages.status, 'failed')).orderBy(desc(bizMessages.updatedAt)).limit(10);
  return {
    runs, minutesSinceRun, overdue: { reminders: remindersDue, sends: sendsDue }, bizQueued, bizFailed24h, sendsFailed30d, emails24h: outbox24h, recentFailures,
    config: {
      email: !!cfg('RESEND_API_KEY'), ai: !!cfg('ANTHROPIC_API_KEY'), push: !!(cfg('VAPID_PUBLIC_KEY') && cfg('VAPID_PRIVATE_KEY')),
      encryption: Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64').length === 32, whatsappWebhook: !!(cfg('WHATSAPP_APP_SECRET') && cfg('WHATSAPP_VERIFY_TOKEN')),
      cronSecret: (process.env.CRON_SECRET ?? '').length >= 16
    },
    healthy: minutesSinceRun !== null && minutesSinceRun <= 5 && remindersDue === 0 && sendsDue === 0
  };
}

export async function auditLog(db: DB, opts: { offset?: number } = {}) {
  return db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(100).offset(opts.offset ?? 0);
}

/* ---------------- Read-only support view ---------------- */

export const SUPPORT_VIEW_MINUTES = 30;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Lets an admin see the app exactly as a user sees it, to help with a support request.
 * Read-only (every change is blocked), limited to 30 minutes, needs a reason, is audited, and the user is told.
 */
export async function startSupportView(db: DB, admin: Admin, userId: string, raw: unknown, now = new Date()) {
  const { reason } = reasonSchema.parse(raw);
  const u = await targetUser(db, admin, userId);
  if (u.suspendedAt) throw badRequest('Restore the account before viewing it');
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({ id: sha(token), userId: u.id, impersonatorId: admin.id, expiresAt: new Date(now.getTime() + SUPPORT_VIEW_MINUTES * 60000) });
  await db.insert(notifications).values({ userId: u.id, title: 'Blessly support viewed your account', body: `A member of our support team looked at your account (read-only) to help with: ${reason}`, link: '/settings', pushedAt: now });
  await audit(db, admin, 'user.support_view', { type: 'user', id: u.id, label: u.email }, reason);
  return { token };
}

/** Ends a support view session (only ever deletes support-view sessions). */
export async function endSupportView(db: DB, token: string | undefined) {
  if (!token || token.length > 100) return;
  await db.delete(sessions).where(and(eq(sessions.id, sha(token)), isNotNull(sessions.impersonatorId)));
}
