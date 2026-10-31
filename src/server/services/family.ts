import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import {
  eventRsvps, families, familyEvents, familyInvites, familyMembers, familyTasks, people, signatures, users, wishes, wishPages
} from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { daysBetween, formatDate, fromISO, isValidMonthDay, toISO, todayIn } from '@/lib/dates';
import { OCCASIONS, type LanguageCode, type OccasionId } from '@/lib/i18n-data';
import { templateWish } from '@/lib/wishes/templates';
import { notify } from './notify';
import { publishWishPage } from './wishes';
import { entitlements, planLimit } from './billing';

/** Largest circle any plan allows (Family plan). The free plan allows fewer — see memberLimit(). */
export const MAX_MEMBERS = 6;

/** How many people the circle may have: set by the owner's plan (free 3, Family/Business 6). */
export async function memberLimit(db: Conn, familyId: string) {
  const [owner] = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, 'owner')));
  if (!owner) return MAX_MEMBERS;
  return (await entitlements(db as DB, owner.userId)).plan.maxFamilyMembers;
}
/** How many circles one person can belong to. */
export const MAX_FAMILIES_PER_USER = 5;
export const INVITE_DAYS = 7;

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Can view' };
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

/** Owners, admins and members can add events, tasks and shared people. Viewers can look, RSVP and tick off tasks given to them. */
export const canEdit = (r: Role) => r !== 'viewer';
/** Owners and admins can invite and remove people. */
export const canManage = (r: Role) => r === 'owner' || r === 'admin';

const uuid = z.string().uuid();
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Conn = DB | Tx;

const forbidden = (msg: string) => new AppError(403, 'forbidden', msg);

/** The caller's membership. Non-members get 404 so circle ids don't leak. */
export async function membership(db: Conn, familyId: string, userId: string) {
  if (!uuid.safeParse(familyId).success) throw notFound('Family not found');
  const [m] = await db.select().from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
  if (!m) throw notFound('Family not found');
  return m as typeof m & { role: Role };
}

async function memberIds(db: Conn, familyId: string, except?: string) {
  const rows = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(eq(familyMembers.familyId, familyId));
  return rows.map((r) => r.userId).filter((id) => id !== except);
}

/** Family ids the user belongs to. */
export async function familyIdsFor(db: Conn, userId: string) {
  const rows = await db.select({ id: familyMembers.familyId }).from(familyMembers).where(eq(familyMembers.userId, userId));
  return rows.map((r) => r.id);
}

/* ---------------- Circles ---------------- */

export const familySchema = z.object({ name: z.string().trim().min(1, 'Give your circle a name').max(60) });

export async function listFamilies(db: DB, userId: string) {
  const rows = await db.select({ f: families, role: familyMembers.role }).from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(eq(familyMembers.userId, userId)).orderBy(asc(families.createdAt));
  if (!rows.length) return [];
  const counts = await db.select({ familyId: familyMembers.familyId, n: count() }).from(familyMembers)
    .where(inArray(familyMembers.familyId, rows.map((r) => r.f.id))).groupBy(familyMembers.familyId);
  const out = [];
  for (const r of rows) out.push({ ...r.f, role: r.role as Role, memberCount: counts.find((c) => c.familyId === r.f.id)?.n ?? 1, limit: await memberLimit(db, r.f.id) });
  return out;
}

export async function createFamily(db: DB, userId: string, raw: unknown) {
  const { name } = familySchema.parse(raw);
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(familyMembers).where(eq(familyMembers.userId, userId));
    if (n >= MAX_FAMILIES_PER_USER) throw badRequest(`You can be in up to ${MAX_FAMILIES_PER_USER} family circles`);
    const [f] = await tx.insert(families).values({ name, createdBy: userId }).returning();
    await tx.insert(familyMembers).values({ familyId: f.id, userId, role: 'owner' });
    return f;
  });
}

export async function renameFamily(db: DB, userId: string, familyId: string, raw: unknown) {
  const m = await membership(db, familyId, userId);
  if (!canManage(m.role)) throw forbidden('Only the owner or an admin can rename the circle');
  const { name } = familySchema.parse(raw);
  const [f] = await db.update(families).set({ name }).where(eq(families.id, familyId)).returning();
  return f;
}

export async function deleteFamily(db: DB, userId: string, familyId: string) {
  const m = await membership(db, familyId, userId);
  if (m.role !== 'owner') throw forbidden('Only the owner can delete the circle');
  await db.delete(families).where(eq(families.id, familyId));
}

export type FamilyView = Awaited<ReturnType<typeof getFamily>>;

/** Everything the Family Circle screen needs, scoped to what the caller may see. */
export async function getFamily(db: DB, userId: string, familyId: string, timezone: string, now = new Date()) {
  const me = await membership(db, familyId, userId);
  const family = (await db.query.families.findFirst({ where: eq(families.id, familyId) }))!;
  const members = await db.select({ userId: familyMembers.userId, role: familyMembers.role, notify: familyMembers.notify, joinedAt: familyMembers.joinedAt, name: users.name, email: users.email })
    .from(familyMembers).innerJoin(users, eq(users.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId)).orderBy(asc(familyMembers.joinedAt));
  const today = todayIn(timezone, now);
  const events = await listEvents(db, userId, familyId, toISO(today));
  const tasks = await db.select().from(familyTasks).where(eq(familyTasks.familyId, familyId)).orderBy(asc(familyTasks.createdAt));
  const shared = await db.select({ id: people.id, name: people.name, relationship: people.relationship, ownerId: people.userId })
    .from(people).where(eq(people.familyId, familyId)).orderBy(asc(people.name));
  const invites = canManage(me.role as Role)
    ? await db.select().from(familyInvites).where(and(eq(familyInvites.familyId, familyId), isNull(familyInvites.revokedAt), gte(familyInvites.expiresAt, now))).orderBy(asc(familyInvites.createdAt))
    : [];
  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.name ?? null;
  return {
    family,
    me: { ...me, role: me.role as Role, canEdit: canEdit(me.role as Role), canManage: canManage(me.role as Role) },
    // Emails are only shown to people who manage the circle.
    members: members.map((m) => ({ ...m, role: m.role as Role, email: canManage(me.role as Role) || m.userId === userId ? m.email : null })),
    events,
    tasks: tasks.map((t) => ({ ...t, assigneeName: nameOf(t.assigneeId) })),
    shared: shared.map((p) => ({ ...p, ownerName: nameOf(p.ownerId) })),
    invites,
    limit: await memberLimit(db, familyId),
    seatsLeft: Math.max(0, (await memberLimit(db, familyId)) - members.length)
  };
}

/* ---------------- Members ---------------- */

export const memberUpdateSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  notify: z.boolean().optional()
});

/**
 * - Anyone can switch shared reminders on or off for themselves.
 * - Only the owner changes roles. Making someone else owner hands over ownership (the old owner becomes an admin).
 */
export async function updateMember(db: DB, actorId: string, familyId: string, memberUserId: string, raw: unknown) {
  const input = memberUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const me = await membership(tx, familyId, actorId);
    if (!uuid.safeParse(memberUserId).success) throw notFound('Member not found');
    const [target] = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, memberUserId))).for('update');
    if (!target) throw notFound('Member not found');
    if (input.notify !== undefined) {
      if (memberUserId !== actorId) throw forbidden('People choose their own reminder settings');
      await tx.update(familyMembers).set({ notify: input.notify }).where(eq(familyMembers.id, target.id));
    }
    if (input.role !== undefined && input.role !== target.role) {
      if (me.role !== 'owner') throw forbidden('Only the owner can change roles');
      if (memberUserId === actorId) throw badRequest('Hand ownership to someone else first');
      if (input.role === 'owner') await tx.update(familyMembers).set({ role: 'admin' }).where(eq(familyMembers.id, me.id));
      await tx.update(familyMembers).set({ role: input.role }).where(eq(familyMembers.id, target.id));
      if (input.role === 'owner') await notify(tx, [memberUserId], { title: 'You now own the family circle', body: 'You can manage members and settings.', link: `/family/${familyId}` });
    }
    const [updated] = await tx.select().from(familyMembers).where(eq(familyMembers.id, target.id));
    return updated;
  });
}

/**
 * Leave (yourself) or remove someone (owner/admin, only people with a lower role).
 * Their shared people go back to private, their RSVPs are removed and their tasks become unassigned.
 * If the owner is the last person, the circle is deleted.
 */
export async function removeMember(db: DB, actorId: string, familyId: string, memberUserId: string) {
  return db.transaction(async (tx) => {
    const me = await membership(tx, familyId, actorId);
    if (!uuid.safeParse(memberUserId).success) throw notFound('Member not found');
    const [target] = await tx.select().from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, memberUserId)));
    if (!target) throw notFound('Member not found');
    const self = memberUserId === actorId;
    if (!self) {
      if (!canManage(me.role as Role)) throw forbidden('Only the owner or an admin can remove people');
      if (RANK[target.role as Role] >= RANK[me.role as Role]) throw forbidden('You can only remove people with a lower role');
    }
    if (self && target.role === 'owner') {
      const others = await memberIds(tx, familyId, actorId);
      if (others.length) throw badRequest('Make someone else the owner before you leave');
      await tx.delete(families).where(eq(families.id, familyId));
      return { deletedFamily: true };
    }
    await tx.update(people).set({ familyId: null }).where(and(eq(people.familyId, familyId), eq(people.userId, memberUserId)));
    const eventIds = (await tx.select({ id: familyEvents.id }).from(familyEvents).where(eq(familyEvents.familyId, familyId))).map((e) => e.id);
    if (eventIds.length) await tx.delete(eventRsvps).where(and(inArray(eventRsvps.eventId, eventIds), eq(eventRsvps.userId, memberUserId)));
    await tx.update(familyTasks).set({ assigneeId: null }).where(and(eq(familyTasks.familyId, familyId), eq(familyTasks.assigneeId, memberUserId)));
    await tx.delete(familyMembers).where(eq(familyMembers.id, target.id));
    return { deletedFamily: false };
  });
}

/* ---------------- Invites ---------------- */

export const inviteSchema = z.object({ role: z.enum(['admin', 'member', 'viewer']).default('member') });

export async function createInvite(db: DB, userId: string, familyId: string, raw: unknown, now = new Date()) {
  const me = await membership(db, familyId, userId);
  if (!canManage(me.role as Role)) throw forbidden('Only the owner or an admin can invite people');
  const { role } = inviteSchema.parse(raw);
  if (role === 'admin' && me.role !== 'owner') throw forbidden('Only the owner can invite admins');
  const [{ n }] = await db.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, familyId));
  const limit = await memberLimit(db, familyId);
  if (n >= limit) throw limit < MAX_MEMBERS ? planLimit(`The free plan allows ${limit} people in a circle. The circle owner can upgrade to Family for up to ${MAX_MEMBERS}.`) : new AppError(409, 'full', `A family circle has up to ${limit} people`);
  const [inv] = await db.insert(familyInvites).values({
    familyId, role, createdBy: userId, token: randomBytes(16).toString('base64url'), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86400000)
  }).returning();
  return inv;
}

export async function revokeInvite(db: DB, userId: string, familyId: string, inviteId: string, now = new Date()) {
  const me = await membership(db, familyId, userId);
  if (!canManage(me.role as Role)) throw forbidden('Only the owner or an admin can cancel invites');
  if (!uuid.safeParse(inviteId).success) throw notFound('Invite not found');
  const [inv] = await db.update(familyInvites).set({ revokedAt: now })
    .where(and(eq(familyInvites.id, inviteId), eq(familyInvites.familyId, familyId), isNull(familyInvites.revokedAt))).returning();
  if (!inv) throw notFound('Invite not found');
}

const tokenOk = (t: string) => /^[A-Za-z0-9_-]{16,40}$/.test(t);

/** What the invite page shows before someone joins. */
export async function previewInvite(db: DB, token: string, userId: string | null, now = new Date()) {
  if (!tokenOk(token)) throw notFound('This invite link is not valid');
  const [row] = await db.select({ inv: familyInvites, family: families, inviter: users.name }).from(familyInvites)
    .innerJoin(families, eq(families.id, familyInvites.familyId))
    .innerJoin(users, eq(users.id, familyInvites.createdBy))
    .where(eq(familyInvites.token, token));
  if (!row) throw notFound('This invite link is not valid');
  const [{ n }] = await db.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, row.family.id));
  const already = userId ? !!(await db.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, row.family.id), eq(familyMembers.userId, userId)) })) : false;
  const status: 'ok' | 'expired' | 'revoked' | 'full' | 'member' =
    already ? 'member' : row.inv.revokedAt ? 'revoked' : row.inv.expiresAt < now ? 'expired' : n >= (await memberLimit(db, row.family.id)) ? 'full' : 'ok';
  return { familyId: row.family.id, familyName: row.family.name, inviter: row.inviter, role: row.inv.role as Role, memberCount: n, status };
}

/** Joins the circle. Idempotent for existing members; serialised per circle so the 6-person limit holds under concurrent joins. */
export async function acceptInvite(db: DB, userId: string, token: string, now = new Date()) {
  if (!tokenOk(token)) throw notFound('This invite link is not valid');
  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(familyInvites).where(eq(familyInvites.token, token)).for('update');
    if (!inv) throw notFound('This invite link is not valid');
    await tx.select({ id: families.id }).from(families).where(eq(families.id, inv.familyId)).for('update');
    const existing = await tx.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, inv.familyId), eq(familyMembers.userId, userId)) });
    if (existing) return { familyId: inv.familyId, joined: false };
    if (inv.revokedAt) throw new AppError(410, 'revoked', 'This invite was cancelled. Ask for a new link.');
    if (inv.expiresAt < now) throw new AppError(410, 'expired', 'This invite has expired. Ask for a new link.');
    const [{ n }] = await tx.select({ n: count() }).from(familyMembers).where(eq(familyMembers.familyId, inv.familyId));
    const limit = await memberLimit(tx, inv.familyId);
    if (n >= limit) throw new AppError(409, 'full', `This family circle is full (${limit} people)`);
    const [{ mine }] = await tx.select({ mine: count() }).from(familyMembers).where(eq(familyMembers.userId, userId));
    if (mine >= MAX_FAMILIES_PER_USER) throw badRequest(`You can be in up to ${MAX_FAMILIES_PER_USER} family circles`);
    await tx.insert(familyMembers).values({ familyId: inv.familyId, userId, role: inv.role });
    await tx.update(familyInvites).set({ uses: sql`${familyInvites.uses} + 1` }).where(eq(familyInvites.id, inv.id));
    const u = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    await notify(tx, await memberIds(tx, inv.familyId, userId), { title: `${u?.name ?? 'Someone'} joined your family circle`, body: 'Say hello and add the dates you share.', link: `/family/${inv.familyId}` });
    return { familyId: inv.familyId, joined: true };
  });
  return result;
}

/* ---------------- Events ---------------- */

const occasionIds = OCCASIONS.map((o) => o.id) as [string, ...string[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').refine((s) => {
  const { y, m, d } = fromISO(s);
  return y >= 2000 && y <= 2100 && isValidMonthDay(m, d) && !(m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)));
}, 'That date does not exist');

export const eventSchema = z.object({
  title: z.string().trim().min(1, 'Give the event a name').max(80),
  occasion: z.enum(occasionIds).default('birthday'),
  eventDate: isoDate,
  eventTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 19:30').optional().nullable().or(z.literal('')).transform((v) => v || null),
  place: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
  notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
  personId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null)
});

async function checkSharedPerson(db: Conn, familyId: string, personId: string | null) {
  if (!personId) return;
  const p = await db.query.people.findFirst({ where: and(eq(people.id, personId), eq(people.familyId, familyId)) });
  if (!p) throw badRequest('Pick someone shared with this circle');
}

type RsvpCounts = { going: number; maybe: number; no: number };

/** Upcoming events (from `fromISO` on) with RSVP counts and the caller's own answer. */
export async function listEvents(db: Conn, userId: string, familyId: string, fromDate: string) {
  const evs = await db.select().from(familyEvents)
    .where(and(eq(familyEvents.familyId, familyId), gte(familyEvents.eventDate, fromDate)))
    .orderBy(asc(familyEvents.eventDate), asc(familyEvents.eventTime)).limit(50);
  if (!evs.length) return [];
  const rs = await db.select().from(eventRsvps).where(inArray(eventRsvps.eventId, evs.map((e) => e.id)));
  return evs.map((e) => {
    const mine = rs.filter((r) => r.eventId === e.id);
    const counts: RsvpCounts = { going: 0, maybe: 0, no: 0 };
    for (const r of mine) counts[r.status]++;
    return { ...e, rsvp: counts, myRsvp: mine.find((r) => r.userId === userId)?.status ?? null };
  });
}

async function loadEvent(db: Conn, eventId: string, userId: string) {
  if (!uuid.safeParse(eventId).success) throw notFound('Event not found');
  const e = await db.query.familyEvents.findFirst({ where: eq(familyEvents.id, eventId) });
  if (!e) throw notFound('Event not found');
  const me = await membership(db, e.familyId, userId).catch(() => { throw notFound('Event not found'); });
  return { e, me: me as typeof me & { role: Role } };
}

export async function createEvent(db: DB, userId: string, familyId: string, raw: unknown) {
  const me = await membership(db, familyId, userId);
  if (!canEdit(me.role as Role)) throw forbidden('Viewers can’t add events');
  const input = eventSchema.parse(raw);
  await checkSharedPerson(db, familyId, input.personId);
  const [e] = await db.insert(familyEvents).values({ ...input, familyId, createdBy: userId }).returning();
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  await notify(db, await memberIds(db, familyId, userId), {
    title: `New family event: ${e.title}`, body: `${u?.name ?? 'Someone'} added it for ${formatDate(fromISO(e.eventDate), { weekday: 'short', day: 'numeric', month: 'short' })}. Are you coming?`, link: `/family/events/${e.id}`
  });
  return e;
}

export async function updateEvent(db: DB, userId: string, eventId: string, raw: unknown) {
  const { e, me } = await loadEvent(db, eventId, userId);
  if (!(canManage(me.role) || (canEdit(me.role) && e.createdBy === userId))) throw forbidden('Only the person who added this event, the owner or an admin can change it');
  const input = eventSchema.parse(raw);
  await checkSharedPerson(db, e.familyId, input.personId);
  const [u] = await db.update(familyEvents).set(input).where(eq(familyEvents.id, e.id)).returning();
  return u;
}

export async function deleteEvent(db: DB, userId: string, eventId: string) {
  const { e, me } = await loadEvent(db, eventId, userId);
  if (!(canManage(me.role) || (canEdit(me.role) && e.createdBy === userId))) throw forbidden('Only the person who added this event, the owner or an admin can delete it');
  await db.delete(familyEvents).where(eq(familyEvents.id, e.id));
  return { familyId: e.familyId };
}

export const rsvpSchema = z.object({ status: z.enum(['going', 'maybe', 'no']) });

export async function setRsvp(db: DB, userId: string, eventId: string, raw: unknown, now = new Date()) {
  const { e } = await loadEvent(db, eventId, userId);
  const { status } = rsvpSchema.parse(raw);
  await db.insert(eventRsvps).values({ eventId: e.id, userId, status, updatedAt: now })
    .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status, updatedAt: now } });
  return { status };
}

export type EventView = Awaited<ReturnType<typeof getEvent>>;

export async function getEvent(db: DB, userId: string, eventId: string, timezone: string, now = new Date()) {
  const { e, me } = await loadEvent(db, eventId, userId);
  const family = (await db.query.families.findFirst({ where: eq(families.id, e.familyId) }))!;
  const members = await db.select({ userId: familyMembers.userId, name: users.name, role: familyMembers.role }).from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId)).where(eq(familyMembers.familyId, e.familyId)).orderBy(asc(familyMembers.joinedAt));
  const rs = await db.select().from(eventRsvps).where(eq(eventRsvps.eventId, e.id));
  const tasks = await db.select().from(familyTasks).where(eq(familyTasks.eventId, e.id)).orderBy(asc(familyTasks.createdAt));
  const person = e.personId ? await db.query.people.findFirst({ where: eq(people.id, e.personId) }) : null;
  let card: null | { wishId: string; slug: string; signedBy: string[]; signatureCount: number; ownedByMe: boolean } = null;
  if (e.wishId) {
    const w = await db.query.wishes.findFirst({ where: eq(wishes.id, e.wishId) });
    const page = w ? await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, w.id) }) : null;
    if (w && page) {
      const sigs = await db.select({ userId: signatures.userId }).from(signatures).where(eq(signatures.wishPageId, page.id));
      const memberSet = new Set(members.map((m) => m.userId));
      const signedBy = [...new Set(sigs.map((s) => s.userId).filter((id): id is string => !!id && memberSet.has(id)))];
      if (w.userId && memberSet.has(w.userId) && !signedBy.includes(w.userId)) signedBy.push(w.userId); // whoever started the card has signed it
      card = { wishId: w.id, slug: page.slug, signedBy, signatureCount: sigs.length, ownedByMe: w.userId === userId };
    }
  }
  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.name ?? null;
  const date = fromISO(e.eventDate);
  return {
    event: e, family, person: person ? { id: person.id, name: person.name } : null,
    me: { role: me.role, canEdit: canEdit(me.role), canChange: canManage(me.role) || (canEdit(me.role) && e.createdBy === userId), rsvp: rs.find((r) => r.userId === userId)?.status ?? null },
    daysAway: daysBetween(todayIn(timezone, now), date),
    members: members.map((m) => ({ ...m, rsvp: rs.find((r) => r.userId === m.userId)?.status ?? null })),
    tasks: tasks.map((t) => ({ ...t, assigneeName: nameOf(t.assigneeId) })),
    card
  };
}

/**
 * Starts the group card for an event: a wish written in the caller's language, published as a wish page
 * that everyone in the circle signs. Idempotent — a second call returns the existing card.
 */
export async function startGroupCard(db: DB, user: { id: string; language: string }, eventId: string) {
  const { e, me } = await loadEvent(db, eventId, user.id);
  if (!canEdit(me.role)) throw forbidden('Viewers can’t start the group card');
  if (e.wishId) {
    const page = await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, e.wishId) });
    if (page) return { slug: page.slug, wishId: e.wishId };
  }
  const family = (await db.query.families.findFirst({ where: eq(families.id, e.familyId) }))!;
  const person = e.personId ? await db.query.people.findFirst({ where: eq(people.id, e.personId) }) : null;
  const recipientName = person?.name.split(' ')[0] ?? e.title;
  const occasion = e.occasion as OccasionId;
  const language = (person?.language ?? user.language) as LanguageCode;
  const { text } = templateWish({ occasion, language, tone: 'heartfelt', recipientName, senderName: family.name });
  const [w] = await db.insert(wishes).values({
    userId: user.id, personId: person?.id ?? null, occasion, language, tone: 'heartfelt', text,
    designIndex: Math.floor(Math.random() * 250), recipientName, senderName: family.name
  }).returning();
  // Publish first, then claim the event's card slot; if someone else got there first, discard ours.
  const page = await publishWishPage(db, user.id, w.id);
  const [claimed] = await db.update(familyEvents).set({ wishId: w.id }).where(and(eq(familyEvents.id, e.id), isNull(familyEvents.wishId))).returning();
  if (!claimed) {
    await db.delete(wishes).where(eq(wishes.id, w.id));
    const fresh = (await db.query.familyEvents.findFirst({ where: eq(familyEvents.id, e.id) }))!;
    const winner = fresh.wishId ? await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, fresh.wishId) }) : null;
    if (!winner) throw new AppError(409, 'busy', 'Someone is starting the card right now — try again in a moment');
    return { slug: winner.slug, wishId: fresh.wishId! };
  }
  await notify(db, await memberIds(db, e.familyId, user.id), { title: `Sign the group card for ${recipientName}`, body: `Add your message before ${formatDate(fromISO(e.eventDate))}.`, link: `/family/events/${e.id}` });
  return { slug: page.slug, wishId: w.id };
}

/* ---------------- Tasks ---------------- */

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'What needs doing?').max(100),
  assigneeId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  dueDate: isoDate.optional().nullable().or(z.literal('')).transform((v) => v || null),
  eventId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null)
});
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  assigneeId: uuid.nullable().optional(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
  dueDate: isoDate.nullable().optional()
});

async function checkAssignee(db: Conn, familyId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const m = await db.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, assigneeId)) });
  if (!m) throw badRequest('Pick someone in this circle');
}

export async function createTask(db: DB, userId: string, familyId: string, raw: unknown) {
  const me = await membership(db, familyId, userId);
  if (!canEdit(me.role as Role)) throw forbidden('Viewers can’t add tasks');
  const input = taskSchema.parse(raw);
  await checkAssignee(db, familyId, input.assigneeId);
  if (input.eventId) {
    const ev = await db.query.familyEvents.findFirst({ where: and(eq(familyEvents.id, input.eventId), eq(familyEvents.familyId, familyId)) });
    if (!ev) throw badRequest('That event is not in this circle');
  }
  const [t] = await db.insert(familyTasks).values({ ...input, familyId, createdBy: userId }).returning();
  if (t.assigneeId && t.assigneeId !== userId) {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    await notify(db, [t.assigneeId], { title: `${u?.name ?? 'Someone'} asked you to: ${t.title}`, body: t.dueDate ? `Due ${formatDate(fromISO(t.dueDate))}.` : 'Tap to see the details.', link: t.eventId ? `/family/events/${t.eventId}` : `/family/${familyId}` });
  }
  return t;
}

async function loadTask(db: Conn, taskId: string, userId: string) {
  if (!uuid.safeParse(taskId).success) throw notFound('Task not found');
  const t = await db.query.familyTasks.findFirst({ where: eq(familyTasks.id, taskId) });
  if (!t) throw notFound('Task not found');
  const me = await membership(db, t.familyId, userId).catch(() => { throw notFound('Task not found'); });
  return { t, me: me as typeof me & { role: Role } };
}

/** Editors can change anything; the person a task is assigned to can always update its status. */
export async function updateTask(db: DB, userId: string, taskId: string, raw: unknown) {
  const { t, me } = await loadTask(db, taskId, userId);
  const input = taskUpdateSchema.parse(raw);
  const onlyStatus = Object.keys(input).every((k) => k === 'status');
  if (!canEdit(me.role) && !(onlyStatus && t.assigneeId === userId)) throw forbidden('You can only update tasks given to you');
  await checkAssignee(db, t.familyId, input.assigneeId);
  const [u] = await db.update(familyTasks).set(input).where(eq(familyTasks.id, t.id)).returning();
  if (input.assigneeId && input.assigneeId !== t.assigneeId && input.assigneeId !== userId) {
    const actor = await db.query.users.findFirst({ where: eq(users.id, userId) });
    await notify(db, [input.assigneeId], { title: `${actor?.name ?? 'Someone'} asked you to: ${u.title}`, body: 'Tap to see the details.', link: u.eventId ? `/family/events/${u.eventId}` : `/family/${u.familyId}` });
  }
  return u;
}

export async function deleteTask(db: DB, userId: string, taskId: string) {
  const { t, me } = await loadTask(db, taskId, userId);
  if (!(canManage(me.role) || (canEdit(me.role) && t.createdBy === userId))) throw forbidden('Only the person who added this task, the owner or an admin can delete it');
  await db.delete(familyTasks).where(eq(familyTasks.id, t.id));
}

/* ---------------- Calendar / home ---------------- */

/** Family events across all the user's circles between two dates (inclusive), for home and the calendar. */
export async function familyEventsBetween(db: DB, userId: string, from: string, to: string) {
  const ids = await familyIdsFor(db, userId);
  if (!ids.length) return [];
  return db.select({ e: familyEvents, familyName: families.name }).from(familyEvents)
    .innerJoin(families, eq(families.id, familyEvents.familyId))
    .where(and(inArray(familyEvents.familyId, ids), gte(familyEvents.eventDate, from), sql`${familyEvents.eventDate} <= ${to}`))
    .orderBy(asc(familyEvents.eventDate));
}

/** Members who should get reminders for people shared with these circles (opted in). */
export async function reminderRecipients(db: DB, familyIds: string[]) {
  if (!familyIds.length) return [];
  return db.select({ familyId: familyMembers.familyId, userId: familyMembers.userId, timezone: users.timezone }).from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(and(inArray(familyMembers.familyId, familyIds), eq(familyMembers.notify, true)));
}
