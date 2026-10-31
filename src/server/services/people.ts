import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { familyMembers, occasions, people, reminders, users } from '../schema';
import { badRequest, notFound } from '../errors';
import { daysBetween, isValidMonthDay, nextYearly, todayIn, type CalDate } from '@/lib/dates';
import { LANGUAGES } from '@/lib/i18n-data';

export const RELATIONSHIPS = ['Mother', 'Father', 'Partner', 'Wife', 'Husband', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandparent', 'Friend', 'Best friend', 'Colleague', 'Customer', 'Other'] as const;
export const OCCASION_KINDS = { birthday: 'birthday', anniversary: 'anniversary', work_anniversary: 'work anniversary', custom: 'occasion' } as const;
const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];

const occasionSchema = z.object({
  kind: z.enum(['birthday', 'anniversary', 'work_anniversary', 'custom']),
  label: z.string().trim().max(60).optional().nullable(),
  month: z.coerce.number().int(),
  day: z.coerce.number().int(),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  remindGift: z.boolean().default(true),
  remindIdeas: z.boolean().default(true),
  remindDraft: z.boolean().default(true),
  remindDay: z.boolean().default(true)
}).refine((o) => isValidMonthDay(o.month, o.day), { message: 'That date does not exist', path: ['day'] });

export const personSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  relationship: z.string().trim().min(1).max(40),
  phone: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200).optional().nullable().or(z.literal('')).transform((v) => v || null),
  language: z.enum(languageCodes).default('en'),
  notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
  occasions: z.array(occasionSchema).max(10).default([]),
  /** Share with a family circle (everyone there sees this person and gets reminders). Null keeps it private. */
  familyId: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null)
});

export type OccasionView = typeof occasions.$inferSelect & { next: CalDate; daysAway: number; label: string };
export type PersonView = typeof people.$inferSelect & { occasions: OccasionView[]; nextOccasion: OccasionView | null; isMine: boolean; ownerName: string | null };

export function occasionLabel(kind: string, label?: string | null) {
  return label || OCCASION_KINDS[kind as keyof typeof OCCASION_KINDS] || 'occasion';
}

function view(p: typeof people.$inferSelect, occ: (typeof occasions.$inferSelect)[], today: CalDate, viewerId: string, ownerName: string | null = null): PersonView {
  const ov = occ.map((o) => {
    const next = nextYearly(o.month, o.day, today);
    return { ...o, next, daysAway: daysBetween(today, next), label: occasionLabel(o.kind, o.label) };
  }).sort((a, b) => a.daysAway - b.daysAway);
  return { ...p, occasions: ov, nextOccasion: ov[0] ?? null, isMine: p.userId === viewerId, ownerName };
}

/** People the user can see: their own, plus people shared with any family circle they belong to. */
function visibleTo(db: DB, userId: string) {
  const myCircles = db.select({ id: familyMembers.familyId }).from(familyMembers).where(eq(familyMembers.userId, userId));
  return or(eq(people.userId, userId), inArray(people.familyId, myCircles));
}

async function ownerNames(db: DB, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function checkFamily(db: DB, userId: string, familyId: string | null) {
  if (!familyId) return;
  const m = await db.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)) });
  if (!m || m.role === 'viewer') throw badRequest('You can only share with a family circle where you can add people');
}

export async function listPeople(db: DB, userId: string, timezone: string, now = new Date()): Promise<PersonView[]> {
  const ps = await db.select().from(people).where(visibleTo(db, userId)).orderBy(asc(people.name));
  if (!ps.length) return [];
  const os = await db.select().from(occasions).where(inArray(occasions.personId, ps.map((p) => p.id)));
  const names = await ownerNames(db, ps.filter((p) => p.userId !== userId).map((p) => p.userId));
  const today = todayIn(timezone, now);
  return ps.map((p) => view(p, os.filter((o) => o.personId === p.id), today, userId, names.get(p.userId) ?? null))
    .sort((a, b) => (a.nextOccasion?.daysAway ?? 9999) - (b.nextOccasion?.daysAway ?? 9999));
}

export async function getPerson(db: DB, userId: string, personId: string, timezone: string, now = new Date()): Promise<PersonView> {
  if (!z.string().uuid().safeParse(personId).success) throw notFound('Person not found');
  const p = await db.query.people.findFirst({ where: and(eq(people.id, personId), eq(people.userId, userId)) });
  if (!p) throw notFound('Person not found');
  const os = await db.select().from(occasions).where(eq(occasions.personId, p.id));
  return view(p, os, todayIn(timezone, now), userId);
}

/** Read-only view of a person the user owns or that is shared with one of their circles. */
export async function getVisiblePerson(db: DB, userId: string, personId: string, timezone: string, now = new Date()): Promise<PersonView> {
  if (!z.string().uuid().safeParse(personId).success) throw notFound('Person not found');
  const p = await db.query.people.findFirst({ where: and(eq(people.id, personId), visibleTo(db, userId)) });
  if (!p) throw notFound('Person not found');
  const os = await db.select().from(occasions).where(eq(occasions.personId, p.id));
  const names = await ownerNames(db, p.userId === userId ? [] : [p.userId]);
  return view(p, os, todayIn(timezone, now), userId, names.get(p.userId) ?? null);
}

export async function createPerson(db: DB, userId: string, raw: unknown, timezone: string) {
  const { occasions: occ, ...input } = personSchema.parse(raw);
  await checkFamily(db, userId, input.familyId);
  const id = await db.transaction(async (tx) => {
    const [p] = await tx.insert(people).values({ ...input, userId }).returning();
    if (occ.length) await tx.insert(occasions).values(occ.map((o) => ({ ...o, userId, personId: p.id })));
    return p.id;
  });
  return getPerson(db, userId, id, timezone);
}

export async function updatePerson(db: DB, userId: string, personId: string, raw: unknown, timezone: string) {
  const before = await getPerson(db, userId, personId, timezone);
  const { occasions: occ, ...input } = personSchema.parse(raw);
  if (input.familyId !== before.familyId) await checkFamily(db, userId, input.familyId);
  await db.transaction(async (tx) => {
    await tx.update(people).set(input).where(and(eq(people.id, personId), eq(people.userId, userId)));
    // Keep unchanged occasions (so their reminder history survives), update flags, add new, remove dropped.
    const existing = await tx.select().from(occasions).where(eq(occasions.personId, personId));
    const key = (o: { kind: string; month: number; day: number; label?: string | null }) => `${o.kind}|${o.month}|${o.day}|${o.label ?? ''}`;
    const keep = new Set<string>();
    for (const o of occ) {
      const match = existing.find((e) => key(e) === key(o) && !keep.has(e.id));
      if (match) {
        keep.add(match.id);
        await tx.update(occasions).set({ year: o.year ?? null, remindGift: o.remindGift, remindIdeas: o.remindIdeas, remindDraft: o.remindDraft, remindDay: o.remindDay }).where(eq(occasions.id, match.id));
      } else {
        await tx.insert(occasions).values({ ...o, userId, personId });
      }
    }
    const drop = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (drop.length) await tx.delete(occasions).where(inArray(occasions.id, drop));
  });
  return getPerson(db, userId, personId, timezone);
}

export async function deletePerson(db: DB, userId: string, personId: string, timezone: string) {
  await getPerson(db, userId, personId, timezone);
  await db.delete(people).where(and(eq(people.id, personId), eq(people.userId, userId)));
}

export async function pendingRemindersFor(db: DB, userId: string) {
  return db.select().from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.status, 'pending'))).orderBy(asc(reminders.dueAt));
}
