import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import {
  automations, bizMessages, businesses, campaigns, customers, eventRsvps, families, familyMembers, familyTasks, notifications,
  occasions, passwordResets, people, pushSubscriptions, scheduledSends, sessions, signatures, users, waTemplates, wishes, wishPages
} from '../schema';
import { AppError, badRequest } from '../errors';
import { sendEmail, type EmailProvider } from '../providers/email';
import { storageFromEnv, type Storage } from '../providers/storage';
import { albumPhotos, albums, files as storedFiles } from '../schema';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const RESET_MINUTES = 60;

/* ---------------- Password reset ---------------- */

/**
 * Emails a one-hour reset link. Always succeeds from the caller's point of view, so it can't be used
 * to find out whether an email has an account.
 */
export async function requestPasswordReset(db: DB, email: EmailProvider, rawEmail: string, appUrl: string, now = new Date()) {
  const addr = String(rawEmail ?? '').trim().toLowerCase();
  if (!z.string().email().safeParse(addr).success) throw badRequest('Enter a valid email');
  const u = await db.query.users.findFirst({ where: eq(users.email, addr) });
  if (!u || u.suspendedAt) return;
  // At most 3 live links per account.
  const live = await db.select().from(passwordResets).where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
  if (live.length >= 3) return;
  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResets).values({ id: hash(token), userId: u.id, expiresAt: new Date(now.getTime() + RESET_MINUTES * 60000) });
  await sendEmail(db, email, {
    to: u.email, subject: 'Reset your Blessly password',
    text: `Hi ${u.name.split(' ')[0]},\n\nSomeone asked to reset the password for your Blessly account. If it was you, choose a new password here (the link works for ${RESET_MINUTES} minutes):\n\n${appUrl}/reset/${token}\n\nIf you didn't ask, you can ignore this email — your password won't change.`
  });
}

export const resetSchema = z.object({ token: z.string().min(20).max(100), password: z.string().min(8, 'Use at least 8 characters').max(200) });

/** Sets the new password, uses up the link, and logs out every device. */
export async function resetPassword(db: DB, raw: unknown, now = new Date()) {
  const { token, password } = resetSchema.parse(raw);
  const passwordHash = await bcrypt.hash(password, 10);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(passwordResets).where(eq(passwordResets.id, hash(token))).for('update');
    if (!r || r.usedAt || r.expiresAt < now) throw new AppError(400, 'bad_token', 'This reset link has expired or was already used. Ask for a new one.');
    await tx.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, r.id));
    await tx.update(users).set({ passwordHash }).where(eq(users.id, r.userId));
    await tx.delete(sessions).where(eq(sessions.userId, r.userId));
    await tx.delete(passwordResets).where(and(eq(passwordResets.userId, r.userId), ne(passwordResets.id, r.id)));
    return { userId: r.userId };
  });
}

/* ---------------- Data export (GDPR / DPDP access request) ---------------- */

const strip = <T extends Record<string, unknown>>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Everything Blessly stores about the user, as JSON. Secrets (password hash, tokens) are left out. */
export async function exportUserData(db: DB, userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw new AppError(404, 'not_found', 'Account not found');
  const ppl = await db.select().from(people).where(eq(people.userId, userId)).orderBy(asc(people.name));
  const occ = await db.select().from(occasions).where(eq(occasions.userId, userId));
  const ws = await db.select().from(wishes).where(eq(wishes.userId, userId)).orderBy(asc(wishes.createdAt));
  const pages = ws.length ? await db.select().from(wishPages).where(inArray(wishPages.wishId, ws.map((w) => w.id))) : [];
  const sigs = pages.length ? await db.select().from(signatures).where(inArray(signatures.wishPageId, pages.map((p) => p.id))) : [];
  const memberships = await db.select({ family: families.name, familyId: families.id, role: familyMembers.role, joinedAt: familyMembers.joinedAt }).from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId)).where(eq(familyMembers.userId, userId));
  const rsvps = await db.select().from(eventRsvps).where(eq(eventRsvps.userId, userId));
  const b = await db.query.businesses.findFirst({ where: eq(businesses.ownerId, userId) });
  return {
    exportedAt: new Date().toISOString(),
    account: strip(u, ['passwordHash', 'totpSecret', 'recoveryCodes', 'totpLastStep']),
    people: ppl.map((p) => ({ ...p, occasions: occ.filter((o) => o.personId === p.id) })),
    wishes: ws.map((w) => {
      const page = pages.find((p) => p.wishId === w.id);
      return { ...w, page: page ? { ...page, signatures: sigs.filter((s) => s.wishPageId === page.id) } : null };
    }),
    scheduledSends: await db.select().from(scheduledSends).where(eq(scheduledSends.userId, userId)),
    notifications: await db.select().from(notifications).where(eq(notifications.userId, userId)),
    familyCircles: memberships,
    eventRsvps: rsvps,
    familyTasksAssignedToMe: await db.select().from(familyTasks).where(eq(familyTasks.assigneeId, userId)),
    pushDevices: (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).map((s) => ({ userAgent: s.userAgent, createdAt: s.createdAt })),
    business: b ? {
      ...strip(b, ['waTokenEnc']),
      customers: (await db.select().from(customers).where(eq(customers.businessId, b.id))).map((c) => strip(c, ['unsubscribeToken'])),
      automations: await db.select().from(automations).where(eq(automations.businessId, b.id)),
      campaigns: await db.select().from(campaigns).where(eq(campaigns.businessId, b.id)),
      templates: await db.select().from(waTemplates).where(eq(waTemplates.businessId, b.id)),
      messages: await db.select().from(bizMessages).where(eq(bizMessages.businessId, b.id))
    } : null
  };
}

/* ---------------- Account deletion ---------------- */

/**
 * Permanently deletes a user and everything they own (people, wishes, business and its customers…).
 * Family circles they own are handed to the next person (admins first) instead of being deleted, so
 * relatives don't lose the circle. Their shared people leave the circle with them.
 */
export async function deleteUserEverywhere(db: DB, userId: string, storage: Storage = storageFromEnv()) {
  // Photo files are removed after the database rows (the files can't be restored by a rollback).
  const files = await db.select({ f: albumPhotos.fullKey, t: albumPhotos.thumbKey }).from(albumPhotos).innerJoin(albums, eq(albums.id, albumPhotos.albumId)).where(eq(albums.userId, userId));
  const editorFiles = await db.select({ key: storedFiles.key }).from(storedFiles).where(eq(storedFiles.ownerId, userId));
  await db.transaction(async (tx) => {
    const owned = await tx.select().from(familyMembers).where(and(eq(familyMembers.userId, userId), eq(familyMembers.role, 'owner')));
    for (const m of owned) {
      const others = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, m.familyId), ne(familyMembers.userId, userId))).orderBy(asc(familyMembers.joinedAt));
      const heir = others.find((o) => o.role === 'admin') ?? others.find((o) => o.role === 'member') ?? others[0];
      if (heir) {
        await tx.update(familyMembers).set({ role: 'owner' }).where(eq(familyMembers.id, heir.id));
        await tx.update(families).set({ createdBy: heir.userId }).where(eq(families.id, m.familyId));
      } else {
        await tx.delete(families).where(eq(families.id, m.familyId));
      }
    }
    // Circles they created but no longer own: move the creator reference so the cascade doesn't remove them.
    const created = await tx.select().from(families).where(eq(families.createdBy, userId));
    for (const f of created) {
      const [owner] = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, f.id), eq(familyMembers.role, 'owner')));
      if (owner && owner.userId !== userId) await tx.update(families).set({ createdBy: owner.userId }).where(eq(families.id, f.id));
    }
    // Events they added stay for the family; wishes behind group cards they started go with them.
    await tx.delete(users).where(eq(users.id, userId));
  });
  for (const x of files) await Promise.all([storage.delete(x.f), storage.delete(x.t)]).catch(() => undefined);
  for (const x of editorFiles) await storage.delete(x.key).catch(() => undefined);
}

export const deleteAccountSchema = z.object({ password: z.string().default(''), confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) });

export async function deleteOwnAccount(db: DB, userId: string, raw: unknown) {
  const { password } = deleteAccountSchema.parse(raw);
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  // Accounts without a password (Google, Apple or phone sign-in) confirm by typing DELETE while signed in.
  if (!u || (u.passwordHash && !(await bcrypt.compare(password, u.passwordHash)))) throw new AppError(401, 'bad_password', 'That password isn’t right');
  await deleteUserEverywhere(db, userId);
}
