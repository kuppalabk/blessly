import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { adminAudit, announcements, businesses, cardOverrides, festivalDates, notifications, users } from '../schema';
import { badRequest, notFound } from '../errors';
import { FESTIVALS, type FestivalDateRow } from '@/lib/festivals';
import { OCCASIONS } from '@/lib/i18n-data';
import { DESIGNS_PER_OCCASION, type CardOverrides } from '@/lib/cards';

type Admin = { id: string; email: string };
const audit = (db: DB, a: Admin, action: string, type: string, id: string | null, label: string, details?: string) =>
  db.insert(adminAudit).values({ adminId: a.id, adminEmail: a.email, action, targetType: type, targetId: id, targetLabel: label, details: details ?? null });

/* ---------------- Festival calendar ---------------- */

let festivalCache: { at: number; rows: FestivalDateRow[] } | null = null;
export function clearContentCache() { festivalCache = null; }

/** Admin-managed festival dates, cached for a minute (they change a few times a year). */
export async function festivalExtras(db: DB): Promise<FestivalDateRow[]> {
  if (festivalCache && Date.now() - festivalCache.at < 60000) return festivalCache.rows;
  const rows = await db.select().from(festivalDates);
  festivalCache = { at: Date.now(), rows: rows.map((r) => ({ festivalId: r.festivalId, name: r.name, occasion: r.occasion, regions: r.regions, date: r.date, approximate: r.approximate, hidden: r.hidden })) };
  return festivalCache.rows;
}

export const festivalDateSchema = z.object({
  festivalId: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(1).max(60),
  occasion: z.enum(OCCASIONS.map((o) => o.id) as [string, ...string[]]).nullable().optional().or(z.literal('')).transform((v) => v || null),
  regions: z.string().trim().toUpperCase().regex(/^(IN|GB|US|AE|GLOBAL)(,(IN|GB|US|AE|GLOBAL))*$/, 'Regions: IN, GB, US, AE or GLOBAL, separated by commas'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approximate: z.boolean().default(false),
  hidden: z.boolean().default(false)
});

export async function listFestivalDates(db: DB) {
  return db.select().from(festivalDates).orderBy(asc(festivalDates.date));
}

/** Adds or replaces the date of a festival for one year (or hides that year's built-in date). */
export async function saveFestivalDate(db: DB, admin: Admin, raw: unknown) {
  const input = festivalDateSchema.parse(raw);
  const year = input.date.slice(0, 4);
  const [row] = await db.transaction(async (tx) => {
    await tx.delete(festivalDates).where(and(eq(festivalDates.festivalId, input.festivalId), sql`to_char(${festivalDates.date}, 'YYYY') = ${year}`));
    return tx.insert(festivalDates).values({ ...input, updatedAt: new Date() }).returning();
  });
  festivalCache = null;
  await audit(db, admin, input.hidden ? 'festival.hide' : 'festival.save', 'festival', row.id, input.name, `${input.date}${input.approximate ? ' (approximate)' : ''}`);
  return row;
}

export async function deleteFestivalDate(db: DB, admin: Admin, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw notFound('Not found');
  const [row] = await db.delete(festivalDates).where(eq(festivalDates.id, id)).returning();
  if (!row) throw notFound('Not found');
  festivalCache = null;
  await audit(db, admin, 'festival.delete', 'festival', id, row.name, row.date);
}

/** Built-in lunar festivals that have no date yet for a given year — what admins need to fill in. */
export async function missingFestivalYears(db: DB, years: number[]) {
  const rows = await festivalExtras(db);
  const missing: { id: string; name: string; year: number }[] = [];
  for (const f of FESTIVALS) {
    if (f.fixed || f.rule) continue;
    for (const y of years) if (!f.dates?.[y] && !rows.some((r) => r.festivalId === f.id && r.date.startsWith(String(y)))) missing.push({ id: f.id, name: f.name, year: y });
  }
  return missing;
}

/* ---------------- Card designs ---------------- */

export async function cardOverridesAll(db: DB): Promise<Record<string, CardOverrides>> {
  const rows = await db.select().from(cardOverrides);
  const out: Record<string, CardOverrides> = {};
  for (const r of rows) {
    out[r.occasion] ??= { hidden: [], featured: [] };
    if (r.hidden) out[r.occasion].hidden.push(r.designIndex);
    if (r.featured) out[r.occasion].featured.push(r.designIndex);
  }
  return out;
}

export const cardOverrideSchema = z.object({
  occasion: z.enum(OCCASIONS.map((o) => o.id) as [string, ...string[]]),
  designIndex: z.coerce.number().int().min(0).max(DESIGNS_PER_OCCASION - 1),
  hidden: z.boolean(),
  featured: z.boolean()
});

export async function setCardOverride(db: DB, admin: Admin, raw: unknown) {
  const input = cardOverrideSchema.parse(raw);
  if (input.hidden && input.featured) throw badRequest('A design can’t be both hidden and featured');
  const all = await cardOverridesAll(db);
  const visible = DESIGNS_PER_OCCASION - (all[input.occasion]?.hidden.filter((i) => i !== input.designIndex).length ?? 0) - (input.hidden ? 1 : 0);
  if (visible < 12) throw badRequest('Keep at least 12 designs visible for each occasion');
  if (!input.hidden && !input.featured) await db.delete(cardOverrides).where(and(eq(cardOverrides.occasion, input.occasion), eq(cardOverrides.designIndex, input.designIndex)));
  else await db.insert(cardOverrides).values(input).onConflictDoUpdate({ target: [cardOverrides.occasion, cardOverrides.designIndex], set: { hidden: input.hidden, featured: input.featured } });
  await audit(db, admin, 'card.update', 'card', null, `${input.occasion} #${input.designIndex + 1}`, input.hidden ? 'hidden' : input.featured ? 'featured' : 'normal');
}

/* ---------------- Announcements ---------------- */

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(500),
  link: z.string().trim().max(200).optional().or(z.literal('')).transform((v) => v || null).refine((v) => !v || /^\/[^/]/.test(v) || /^https:\/\//.test(v), 'Link must start with / or https://'),
  audience: z.string().regex(/^(all|business|country:(IN|GB|US|AE))$/)
});

/** Sends an in-app alert (and push, via the job runner) to every matching, non-suspended user. */
export async function sendAnnouncement(db: DB, admin: Admin, raw: unknown) {
  const input = announcementSchema.parse(raw);
  const conds = [sql`${users.suspendedAt} is null`];
  if (input.audience === 'business') conds.push(inArray(users.id, db.select({ id: businesses.ownerId }).from(businesses)));
  if (input.audience.startsWith('country:')) conds.push(eq(users.country, input.audience.slice(8)));
  const ids = (await db.select({ id: users.id }).from(users).where(and(...conds))).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    await db.insert(notifications).values(ids.slice(i, i + 1000).map((userId) => ({ userId, title: input.title, body: input.body, link: input.link })));
  }
  const [a] = await db.insert(announcements).values({ ...input, recipients: ids.length, createdBy: admin.id }).returning();
  await audit(db, admin, 'announcement.send', 'announcement', a.id, input.title, `${input.audience} · ${ids.length} people`);
  return a;
}

export async function listAnnouncements(db: DB) {
  return db.select().from(announcements).orderBy(sql`${announcements.createdAt} desc`).limit(50);
}

