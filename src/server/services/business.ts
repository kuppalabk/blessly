import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { automations, bizMessages, businesses, businessInvites, businessMembers, campaigns, customers, users, waTemplates } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { decrypt, encrypt } from '../crypto';
import { CloudApiProvider, type WhatsAppProvider } from '../providers/whatsapp';
import { addDays, isValidMonthDay, isValidTimezone, todayIn } from '@/lib/dates';
import { normalizePhone } from '@/lib/send-links';
import { LANGUAGES } from '@/lib/i18n-data';
import { parseCsv } from '@/lib/csv';
import { businessAllowance, businessSeats, planLimit, TRIAL_DAYS } from './billing';
import { sendEmail, type EmailProvider } from '../providers/email';

const uuid = z.string().uuid();
const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];
export const MAX_CUSTOMERS = 20000;
export const MAX_IMPORT_ROWS = 5000;

export type Business = typeof businesses.$inferSelect;
/** What the browser may see: never the token. */
export function publicBusiness(b: Business) {
  const { waTokenEnc, ...rest } = b;
  return { ...rest, waConnected: !!(waTokenEnc && b.waPhoneNumberId && b.waConnectedAt) };
}

/* ---------------- Workspace ---------------- */

export const businessSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name').max(80),
  timezone: z.string().refine(isValidTimezone, 'Pick a valid timezone').default('Asia/Kolkata'),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a 2-letter country code').default('IN')
});

export const DEFAULT_EMAIL = {
  birthday: { subject: 'Happy birthday, {name}!', body: 'Wishing you a wonderful birthday, {name}, from all of us at {business}. Have a lovely day!' },
  anniversary: { subject: 'Happy anniversary, {name}!', body: 'Happy anniversary, {name}! Thank you for being with {business} — wishing you many happy years ahead.' }
} as const;

/** The business the user works in: their own, or one they joined as team staff. */
export async function getMyBusiness(db: DB, userId: string) {
  const own = await db.query.businesses.findFirst({ where: eq(businesses.ownerId, userId) });
  if (own) return own;
  const [m] = await db.select({ b: businesses }).from(businessMembers).innerJoin(businesses, eq(businesses.id, businessMembers.businessId)).where(eq(businessMembers.userId, userId)).limit(1);
  return m?.b ?? null;
}

export async function requireBusiness(db: DB, userId: string) {
  const b = await getMyBusiness(db, userId);
  if (!b) throw notFound('Set up your business first');
  return b;
}

/** Owner-only actions: business details, WhatsApp connection, team. */
export async function requireOwnedBusiness(db: DB, userId: string) {
  const b = await requireBusiness(db, userId);
  if (b.ownerId !== userId) throw new AppError(403, 'forbidden', 'Only the business owner can do this');
  return b;
}

/* ---------------- Team ---------------- */

export async function listTeam(db: DB, b: Business, now = new Date()) {
  const owner = await db.query.users.findFirst({ where: eq(users.id, b.ownerId) });
  const staff = await db.select({ userId: users.id, name: users.name, email: users.email, joinedAt: businessMembers.joinedAt }).from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId)).where(eq(businessMembers.businessId, b.id)).orderBy(asc(businessMembers.joinedAt));
  const invites = await db.select().from(businessInvites).where(and(eq(businessInvites.businessId, b.id), isNull(businessInvites.acceptedAt), gte(businessInvites.expiresAt, now)));
  return { owner: { userId: b.ownerId, name: owner?.name ?? '', email: owner?.email ?? '' }, staff, invites, seats: await businessSeats(db, b, now) };
}

export async function inviteStaff(db: DB, userId: string, raw: unknown, email: EmailProvider, appUrl: string, now = new Date()) {
  const b = await requireOwnedBusiness(db, userId);
  const { email: to } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') }).parse(raw);
  const team = await listTeam(db, b, now);
  if (to === team.owner.email || team.staff.some((s) => s.email === to)) throw badRequest('They’re already on your team');
  if (1 + team.staff.length + team.invites.length >= team.seats) throw planLimit(`Your plan includes ${team.seats} team login${team.seats === 1 ? '' : 's'} (including you).`);
  const token = randomBytes(16).toString('base64url');
  const [inv] = await db.insert(businessInvites).values({ businessId: b.id, email: to, token, expiresAt: new Date(now.getTime() + 7 * 86400000) }).returning();
  await sendEmail(db, email, { to, subject: `Join ${b.name} on Blessly`, text: `${team.owner.name} invited you to help send wishes to ${b.name}'s customers on Blessly.\n\nAccept (link works for 7 days, sign up or log in with ${to}):\n${appUrl}/business/join/${token}` });
  return inv;
}

export async function revokeStaffInvite(db: DB, userId: string, inviteId: string) {
  const b = await requireOwnedBusiness(db, userId);
  if (!uuid.safeParse(inviteId).success) throw notFound('Invite not found');
  await db.delete(businessInvites).where(and(eq(businessInvites.id, inviteId), eq(businessInvites.businessId, b.id)));
}

export async function removeStaff(db: DB, userId: string, staffUserId: string) {
  const b = await requireBusiness(db, userId);
  // The owner removes anyone; staff can remove themselves (leave).
  if (b.ownerId !== userId && staffUserId !== userId) throw new AppError(403, 'forbidden', 'Only the business owner can remove people');
  if (!uuid.safeParse(staffUserId).success) throw notFound('Not on the team');
  await db.delete(businessMembers).where(and(eq(businessMembers.businessId, b.id), eq(businessMembers.userId, staffUserId)));
}

export async function previewStaffInvite(db: DB, token: string, user: { id: string; email: string }, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw notFound('This invite link is not valid');
  const [row] = await db.select({ inv: businessInvites, b: businesses }).from(businessInvites).innerJoin(businesses, eq(businesses.id, businessInvites.businessId)).where(eq(businessInvites.token, token));
  if (!row) throw notFound('This invite link is not valid');
  const status = row.inv.acceptedAt ? 'used' : row.inv.expiresAt < now ? 'expired' : row.inv.email !== user.email ? 'wrong_email' : row.b.ownerId === user.id ? 'owner' : 'ok';
  return { businessName: row.b.name, email: row.inv.email, status };
}

/** Joins with the invited email only, once. A person can be on one business team at a time (besides their own). */
export async function acceptStaffInvite(db: DB, token: string, user: { id: string; email: string }, now = new Date()) {
  const p = await previewStaffInvite(db, token, user, now);
  if (p.status === 'wrong_email') throw new AppError(403, 'wrong_email', `This invite is for ${p.email}. Log in with that email to accept it.`);
  if (p.status !== 'ok') throw new AppError(410, p.status, p.status === 'expired' ? 'This invite has expired. Ask for a new one.' : 'This invite was already used.');
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(businessInvites).where(eq(businessInvites.token, token)).for('update');
    if (inv.acceptedAt) throw new AppError(410, 'used', 'This invite was already used.');
    const existing = await tx.query.businessMembers.findFirst({ where: eq(businessMembers.userId, user.id) });
    if (existing && existing.businessId !== inv.businessId) throw badRequest('You’re already on another business’s team. Leave it first.');
    await tx.insert(businessMembers).values({ businessId: inv.businessId, userId: user.id }).onConflictDoNothing();
    await tx.update(businessInvites).set({ acceptedAt: now }).where(eq(businessInvites.id, inv.id));
    return { businessId: inv.businessId };
  });
}

export async function createBusiness(db: DB, userId: string, raw: unknown) {
  const input = businessSchema.parse(raw);
  if (await db.query.businesses.findFirst({ where: eq(businesses.ownerId, userId) })) throw new AppError(409, 'exists', 'You already have a business workspace');
  return db.transaction(async (tx) => {
    const [b] = await tx.insert(businesses).values({ ...input, ownerId: userId, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000) }).returning();
    await tx.insert(automations).values((['birthday', 'anniversary'] as const).map((kind) => ({ businessId: b.id, kind, emailSubject: DEFAULT_EMAIL[kind].subject, emailBody: DEFAULT_EMAIL[kind].body })));
    return b;
  });
}

export async function updateBusiness(db: DB, userId: string, raw: unknown) {
  const b = await requireOwnedBusiness(db, userId);
  const input = businessSchema.parse(raw);
  const [u] = await db.update(businesses).set(input).where(eq(businesses.id, b.id)).returning();
  return u;
}

/* ---------------- WhatsApp connection ---------------- */

export const connectSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, 'Phone number ID is the long number from WhatsApp Manager → API setup'),
  businessAccountId: z.string().trim().regex(/^\d{5,25}$/, 'WhatsApp Business Account ID is a long number'),
  accessToken: z.string().trim().min(20, 'Paste the permanent (system user) access token').max(1000)
});

/** Checks the credentials with Meta, then stores them (token encrypted) and pulls the approved templates. */
export async function connectWhatsApp(db: DB, userId: string, raw: unknown, wa: WhatsAppProvider = new CloudApiProvider(), now = new Date()) {
  const b = await requireOwnedBusiness(db, userId);
  const input = connectSchema.parse(raw);
  const taken = await db.query.businesses.findFirst({ where: eq(businesses.waPhoneNumberId, input.phoneNumberId) });
  if (taken && taken.id !== b.id) throw new AppError(409, 'taken', 'This WhatsApp number is already connected to another Blessly business');
  let info: { displayNumber: string; verifiedName: string };
  try {
    info = await wa.phoneNumber({ phoneNumberId: input.phoneNumberId, token: input.accessToken });
  } catch (e) {
    throw badRequest(`WhatsApp didn’t accept these details: ${(e as Error).message}`);
  }
  const [u] = await db.update(businesses).set({
    waPhoneNumberId: input.phoneNumberId, waBusinessAccountId: input.businessAccountId, waTokenEnc: encrypt(input.accessToken),
    waDisplayNumber: info.displayNumber, waVerifiedName: info.verifiedName, waConnectedAt: now
  }).where(eq(businesses.id, b.id)).returning();
  await syncTemplates(db, userId, wa).catch(() => undefined);
  return u;
}

export async function disconnectWhatsApp(db: DB, userId: string) {
  const b = await requireOwnedBusiness(db, userId);
  await db.update(businesses).set({ waPhoneNumberId: null, waBusinessAccountId: null, waTokenEnc: null, waDisplayNumber: null, waVerifiedName: null, waConnectedAt: null }).where(eq(businesses.id, b.id));
}

export function waCreds(b: Business) {
  if (!b.waTokenEnc || !b.waPhoneNumberId) return null;
  return { phoneNumberId: b.waPhoneNumberId, token: decrypt(b.waTokenEnc) };
}

/** Pulls templates from Meta. Templates that disappeared from Meta are marked as such (kept so history still makes sense). */
export async function syncTemplates(db: DB, userId: string, wa: WhatsAppProvider = new CloudApiProvider(), now = new Date()) {
  const b = await requireOwnedBusiness(db, userId);
  const creds = waCreds(b);
  if (!creds || !b.waBusinessAccountId) throw badRequest('Connect WhatsApp first');
  let list;
  try { list = await wa.templates(b.waBusinessAccountId, creds.token); } catch (e) { throw badRequest(`Couldn’t load templates: ${(e as Error).message}`); }
  for (const t of list) {
    await db.insert(waTemplates).values({ businessId: b.id, ...t, syncedAt: now })
      .onConflictDoUpdate({ target: [waTemplates.businessId, waTemplates.name, waTemplates.language], set: { category: t.category, status: t.status, body: t.body, paramCount: t.paramCount, syncedAt: now } });
  }
  const seen = new Set(list.map((t) => `${t.name}|${t.language}`));
  for (const t of await db.select().from(waTemplates).where(eq(waTemplates.businessId, b.id))) {
    if (!seen.has(`${t.name}|${t.language}`) && t.status !== 'DELETED') await db.update(waTemplates).set({ status: 'DELETED', syncedAt: now }).where(eq(waTemplates.id, t.id));
  }
  return listTemplates(db, b.id);
}

export async function listTemplates(db: DB, businessId: string) {
  return db.select().from(waTemplates).where(eq(waTemplates.businessId, businessId)).orderBy(asc(waTemplates.name), asc(waTemplates.language));
}

/** A template is usable when Meta approved it and we can fill its variables: {{1}} = first name, {{2}} = business name. */
export const usableTemplate = (t: { status: string; paramCount: number }) => t.status === 'APPROVED' && t.paramCount <= 2;

/* ---------------- Customers ---------------- */

const monthDay = (m?: number | null, d?: number | null) => (m == null && d == null) || (m != null && d != null && isValidMonthDay(m, d));

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  phone: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200).optional().nullable().or(z.literal('')).transform((v) => v || null),
  language: z.enum(languageCodes).default('en'),
  birthdayMonth: z.coerce.number().int().min(1).max(12).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v == null ? null : v)),
  birthdayDay: z.coerce.number().int().min(1).max(31).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v == null ? null : v)),
  anniversaryMonth: z.coerce.number().int().min(1).max(12).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v == null ? null : v)),
  anniversaryDay: z.coerce.number().int().min(1).max(31).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v == null ? null : v)),
  tags: z.string().trim().max(200).optional().default('').transform(normTags),
  /** The business confirms this person agreed to receive messages (required by WhatsApp and email law). */
  consent: z.boolean().default(false),
  consentSource: z.string().trim().max(100).optional()
}).refine((c) => monthDay(c.birthdayMonth, c.birthdayDay), { message: 'That birthday does not exist', path: ['birthdayDay'] })
  .refine((c) => monthDay(c.anniversaryMonth, c.anniversaryDay), { message: 'That date does not exist', path: ['anniversaryDay'] })
  .refine((c) => c.phone || c.email, { message: 'Add a mobile number or an email', path: ['phone'] });

function normTags(s: string) {
  return [...new Set(s.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => t.slice(0, 30)))].slice(0, 10).join(',');
}

type CustomerInput = z.infer<typeof customerSchema>;

function toRow(input: CustomerInput, country: string, now: Date, existing?: typeof customers.$inferSelect) {
  const phone = input.phone ? normalizePhone(input.phone, country) : null;
  if (input.phone && !phone) throw new z.ZodError([{ code: 'custom', path: ['phone'], message: 'Enter a valid mobile number with country code' }]);
  const { consent, consentSource, ...rest } = input;
  return {
    ...rest, phone,
    consentAt: consent ? existing?.consentAt ?? now : null,
    consentSource: consent ? existing?.consentAt ? existing.consentSource : consentSource || 'Added by business' : null
  };
}

function uniqueViolation(e: unknown): never {
  const msg = String((e as { message?: string; cause?: { message?: string } }).cause?.message ?? (e as Error).message);
  if (msg.includes('customers_phone_idx')) throw new z.ZodError([{ code: 'custom', path: ['phone'], message: 'A customer with this number already exists' }]);
  if (msg.includes('customers_email_idx')) throw new z.ZodError([{ code: 'custom', path: ['email'], message: 'A customer with this email already exists' }]);
  throw e;
}

export async function listCustomers(db: DB, businessId: string, opts: { q?: string; tag?: string; limit?: number; offset?: number } = {}) {
  const conds = [eq(customers.businessId, businessId)];
  const q = opts.q?.trim();
  if (q) conds.push(or(ilike(customers.name, `%${q.replace(/[%_]/g, '\\$&')}%`), ilike(customers.email, `%${q.replace(/[%_]/g, '\\$&')}%`), ilike(customers.phone, `%${q.replace(/\D/g, '') || '~'}%`))!);
  if (opts.tag) conds.push(sql`(',' || ${customers.tags} || ',') like ${'%,' + opts.tag.toLowerCase() + ',%'}`);
  const where = and(...conds);
  const rows = await db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(Math.min(opts.limit ?? 50, 200)).offset(opts.offset ?? 0);
  const [{ n }] = await db.select({ n: count() }).from(customers).where(where);
  return { customers: rows, total: n };
}

export async function getCustomer(db: DB, businessId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Customer not found');
  const c = await db.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.businessId, businessId)) });
  if (!c) throw notFound('Customer not found');
  return c;
}

export async function createCustomer(db: DB, b: Business, raw: unknown, now = new Date()) {
  const input = customerSchema.parse(raw);
  const [{ n }] = await db.select({ n: count() }).from(customers).where(eq(customers.businessId, b.id));
  if (n >= MAX_CUSTOMERS) throw badRequest(`Your plan holds up to ${MAX_CUSTOMERS.toLocaleString()} customers`);
  try {
    const [c] = await db.insert(customers).values({ ...toRow(input, b.country, now), businessId: b.id, unsubscribeToken: randomBytes(12).toString('base64url') }).returning();
    return c;
  } catch (e) { uniqueViolation(e); }
}

export async function updateCustomer(db: DB, b: Business, id: string, raw: unknown, now = new Date()) {
  const existing = await getCustomer(db, b.id, id);
  const input = customerSchema.parse(raw);
  try {
    const [c] = await db.update(customers).set(toRow(input, b.country, now, existing)).where(eq(customers.id, existing.id)).returning();
    return c;
  } catch (e) { uniqueViolation(e); }
}

export async function deleteCustomer(db: DB, businessId: string, id: string) {
  const c = await getCustomer(db, businessId, id);
  await db.delete(customers).where(eq(customers.id, c.id));
}

const HEADERS: Record<string, keyof CustomerInput> = {
  name: 'name', 'full name': 'name', customer: 'name',
  phone: 'phone', mobile: 'phone', whatsapp: 'phone', 'phone number': 'phone', 'mobile number': 'phone',
  email: 'email', 'e-mail': 'email', 'email address': 'email',
  language: 'language', tags: 'tags', tag: 'tags', group: 'tags'
};

/** Accepts 2026-03-14, 14/03/1990, 14-03, 14 Mar, March 14. Day first for numeric dates (as in India/UK). */
export function parseMonthDay(raw: string): { m: number; d: number } | null {
  const s = raw.trim();
  if (!s) return null;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m: number | undefined, d: number | undefined;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (x) { m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s))) { d = +x[1]; m = +x[2]; }
  else if ((x = /^(\d{1,2})\s+([a-z]+)\.?(?:\s+\d{2,4})?$/i.exec(s))) { d = +x[1]; m = MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1; }
  else if ((x = /^([a-z]+)\.?\s+(\d{1,2})(?:,?\s+\d{2,4})?$/i.exec(s))) { m = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1; d = +x[2]; }
  if (!m || !d || !isValidMonthDay(m, d)) return null;
  return { m, d };
}

export type ImportResult = { added: number; updated: number; skipped: { row: number; reason: string }[] };

/**
 * Imports customers from CSV. Columns are matched by header (name, phone/mobile/whatsapp, email, birthday/dob,
 * anniversary, language, tags). Existing customers (same phone or email) are updated. The business must confirm
 * that everyone in the file agreed to receive messages.
 */
export async function importCustomers(db: DB, b: Business, csv: string, opts: { consent: boolean }, now = new Date()): Promise<ImportResult> {
  if (!opts.consent) throw badRequest('Confirm that these customers agreed to receive messages from you');
  if (csv.length > 2_000_000) throw badRequest('The file is too big (2 MB max). Split it into smaller files.');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw badRequest('The file needs a header row and at least one customer');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw badRequest(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} customers at a time`);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = col(['name', 'full name', 'customer']);
  if (iName < 0) throw badRequest('Add a “name” column');
  const iBday = col(['birthday', 'dob', 'date of birth', 'birth date']);
  const iAnniv = col(['anniversary', 'anniversary date', 'wedding anniversary']);
  const result: ImportResult = { added: 0, updated: 0, skipped: [] };
  const source = `CSV import ${now.toISOString().slice(0, 10)}`;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => !c.trim())) continue;
    const rec: Record<string, unknown> = { consent: true, consentSource: source };
    header.forEach((h, i) => { const k = HEADERS[h]; if (k && cells[i] !== undefined) rec[k] = cells[i].trim(); });
    const lang = String(rec.language ?? '').toLowerCase();
    if (languageCodes.includes(lang)) rec.language = lang; else delete rec.language;
    for (const k of ['phone', 'email', 'tags'] as const) if (rec[k] === '') delete rec[k];
    const bd = iBday >= 0 ? cells[iBday]?.trim() ?? '' : '';
    const an = iAnniv >= 0 ? cells[iAnniv]?.trim() ?? '' : '';
    const bdp = bd ? parseMonthDay(bd) : null, anp = an ? parseMonthDay(an) : null;
    if (bd && !bdp) { result.skipped.push({ row: r + 1, reason: `Couldn’t read birthday “${bd.slice(0, 20)}”` }); continue; }
    if (an && !anp) { result.skipped.push({ row: r + 1, reason: `Couldn’t read anniversary “${an.slice(0, 20)}”` }); continue; }
    if (bdp) { rec.birthdayMonth = bdp.m; rec.birthdayDay = bdp.d; }
    if (anp) { rec.anniversaryMonth = anp.m; rec.anniversaryDay = anp.d; }
    const parsed = customerSchema.safeParse(rec);
    if (!parsed.success) { result.skipped.push({ row: r + 1, reason: parsed.error.issues[0].message }); continue; }
    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone, b.country) : null;
    if (parsed.data.phone && !phone) { result.skipped.push({ row: r + 1, reason: 'Invalid mobile number' }); continue; }
    const existing = await db.query.customers.findFirst({
      where: and(eq(customers.businessId, b.id), or(phone ? eq(customers.phone, phone) : sql`false`, parsed.data.email ? eq(customers.email, parsed.data.email) : sql`false`))
    });
    try {
      if (existing) {
        // Keep anything the file leaves blank.
        const merged = { ...parsed.data, phone: parsed.data.phone ?? existing.phone, email: parsed.data.email ?? existing.email,
          birthdayMonth: parsed.data.birthdayMonth ?? existing.birthdayMonth, birthdayDay: parsed.data.birthdayDay ?? existing.birthdayDay,
          anniversaryMonth: parsed.data.anniversaryMonth ?? existing.anniversaryMonth, anniversaryDay: parsed.data.anniversaryDay ?? existing.anniversaryDay,
          tags: normTags([existing.tags, parsed.data.tags].filter(Boolean).join(',')) };
        await db.update(customers).set(toRow(merged, b.country, now, existing)).where(eq(customers.id, existing.id));
        result.updated++;
      } else {
        const [{ n }] = await db.select({ n: count() }).from(customers).where(eq(customers.businessId, b.id));
        if (n >= MAX_CUSTOMERS) { result.skipped.push({ row: r + 1, reason: 'Customer limit reached' }); continue; }
        await db.insert(customers).values({ ...toRow(parsed.data, b.country, now), businessId: b.id, unsubscribeToken: randomBytes(12).toString('base64url') });
        result.added++;
      }
    } catch (e) {
      result.skipped.push({ row: r + 1, reason: (e as Error).message.includes('customers_') ? 'Duplicate phone or email in this file' : 'Could not save' });
    }
  }
  return result;
}

/* ---------------- Opt-out (public, by link) ---------------- */

export async function customerByUnsubscribeToken(db: DB, token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw notFound('This link is not valid');
  const [row] = await db.select({ c: customers, businessName: businesses.name }).from(customers)
    .innerJoin(businesses, eq(businesses.id, customers.businessId)).where(eq(customers.unsubscribeToken, token));
  if (!row) throw notFound('This link is not valid');
  return row;
}

export async function unsubscribe(db: DB, token: string, channels: { whatsapp: boolean; email: boolean }, now = new Date()) {
  const { c } = await customerByUnsubscribeToken(db, token);
  await db.update(customers).set({
    waOptOutAt: channels.whatsapp ? c.waOptOutAt ?? now : c.waOptOutAt,
    emailOptOutAt: channels.email ? c.emailOptOutAt ?? now : c.emailOptOutAt
  }).where(eq(customers.id, c.id));
  // Anything still waiting to go out on those channels is dropped.
  const drop = [channels.whatsapp && 'whatsapp', channels.email && 'email'].filter(Boolean) as ('whatsapp' | 'email')[];
  if (drop.length) await db.update(bizMessages).set({ status: 'skipped', error: 'Customer unsubscribed', updatedAt: now })
    .where(and(eq(bizMessages.customerId, c.id), eq(bizMessages.status, 'queued'), inArray(bizMessages.channel, drop)));
}

/* ---------------- Automations ---------------- */

export const automationSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(['both', 'whatsapp', 'email']),
  templateId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  emailSubject: z.string().trim().min(1, 'Add a subject').max(150),
  emailBody: z.string().trim().min(1, 'Write the message').max(2000),
  sendHour: z.coerce.number().int().min(0).max(23)
});

async function checkTemplate(db: DB, businessId: string, templateId: string | null, channel: string, enabling: boolean) {
  if (templateId) {
    const t = await db.query.waTemplates.findFirst({ where: and(eq(waTemplates.id, templateId), eq(waTemplates.businessId, businessId)) });
    if (!t) throw badRequest('Pick one of your WhatsApp templates');
    if (!usableTemplate(t)) throw badRequest(t.status !== 'APPROVED' ? 'That template isn’t approved by WhatsApp yet' : 'That template has more than 2 variables — use one with {{1}} for the name and {{2}} for your business');
  } else if (enabling && channel === 'whatsapp') {
    throw badRequest('Pick an approved WhatsApp template, or send by email');
  }
}

export async function listAutomations(db: DB, businessId: string) {
  return db.select().from(automations).where(eq(automations.businessId, businessId)).orderBy(desc(automations.kind)); // birthday first
}

export async function updateAutomation(db: DB, b: Business, kind: string, raw: unknown, now = new Date()) {
  if (kind !== 'birthday' && kind !== 'anniversary') throw notFound('Automation not found');
  const input = automationSchema.parse(raw);
  await checkTemplate(db, b.id, input.templateId, input.channel, input.enabled);
  const [a] = await db.update(automations).set({ ...input, updatedAt: now }).where(and(eq(automations.businessId, b.id), eq(automations.kind, kind))).returning();
  return a;
}

/* ---------------- Campaigns ---------------- */

export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Name the campaign').max(80),
  channel: z.enum(['both', 'whatsapp', 'email']),
  templateId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  emailSubject: z.string().trim().max(150).default(''),
  emailBody: z.string().trim().max(2000).default(''),
  tag: z.string().trim().toLowerCase().max(30).default(''),
  sendAt: z.coerce.date()
});

function audienceWhere(businessId: string, tag: string) {
  const conds = [eq(customers.businessId, businessId), isNotNull(customers.consentAt)];
  if (tag) conds.push(sql`(',' || ${customers.tags} || ',') like ${'%,' + tag + ',%'}`);
  return and(...conds);
}

export async function audienceSize(db: DB, businessId: string, tag: string) {
  const [{ n }] = await db.select({ n: count() }).from(customers).where(audienceWhere(businessId, tag));
  return n;
}

export async function audienceIds(db: DB, businessId: string, tag: string) {
  return (await db.select({ id: customers.id }).from(customers).where(audienceWhere(businessId, tag))).map((r) => r.id);
}

export async function createCampaign(db: DB, b: Business, raw: unknown, now = new Date()) {
  const input = campaignSchema.parse(raw);
  if (input.sendAt.getTime() < now.getTime() - 60000) throw badRequest('Pick a time in the future');
  if (input.sendAt.getTime() > now.getTime() + 366 * 86400000) throw badRequest('Schedule up to a year ahead');
  if (input.channel !== 'whatsapp' && (!input.emailSubject || !input.emailBody)) throw badRequest('Add the email subject and message');
  if (input.channel !== 'email' && !input.templateId) throw badRequest('Pick an approved WhatsApp template');
  await checkTemplate(db, b.id, input.templateId, input.channel, true);
  const n = await audienceSize(db, b.id, input.tag);
  if (!n) throw badRequest(input.tag ? `No customers with the tag “${input.tag}” have agreed to messages` : 'Add customers who agreed to messages first');
  const [c] = await db.insert(campaigns).values({ ...input, businessId: b.id, audience: n }).returning();
  return c;
}

export async function listCampaigns(db: DB, businessId: string) {
  const list = await db.select().from(campaigns).where(eq(campaigns.businessId, businessId)).orderBy(desc(campaigns.sendAt)).limit(100);
  if (!list.length) return [];
  const stats = await db.select({ campaignId: bizMessages.campaignId, status: bizMessages.status, n: count() }).from(bizMessages)
    .where(inArray(bizMessages.campaignId, list.map((c) => c.id))).groupBy(bizMessages.campaignId, bizMessages.status);
  return list.map((c) => ({ ...c, stats: Object.fromEntries(stats.filter((s) => s.campaignId === c.id).map((s) => [s.status, s.n])) as Record<string, number> }));
}

export async function cancelCampaign(db: DB, businessId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Campaign not found');
  const [c] = await db.update(campaigns).set({ status: 'cancelled' }).where(and(eq(campaigns.id, id), eq(campaigns.businessId, businessId), eq(campaigns.status, 'scheduled'))).returning();
  if (!c) throw badRequest('Only scheduled campaigns can be cancelled');
  return c;
}

/* ---------------- Dashboard ---------------- */

export function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Messages that count toward the plan this month: everything actually handed to WhatsApp or the email provider. */
export async function usedThisMonth(db: DB, businessId: string, now = new Date()) {
  const [{ n }] = await db.select({ n: count() }).from(bizMessages)
    .where(and(eq(bizMessages.businessId, businessId), gte(bizMessages.sentAt, monthStart(now)), inArray(bizMessages.status, ['sent', 'delivered', 'read'])));
  return n;
}

export async function dashboard(db: DB, b: Business, now = new Date()) {
  const since = monthStart(now);
  const byStatus = await db.select({ status: bizMessages.status, channel: bizMessages.channel, n: count() }).from(bizMessages)
    .where(and(eq(bizMessages.businessId, b.id), gte(bizMessages.createdAt, since))).groupBy(bizMessages.status, bizMessages.channel);
  const [{ total }] = await db.select({ total: count() }).from(customers).where(eq(customers.businessId, b.id));
  const [{ consented }] = await db.select({ consented: count() }).from(customers).where(and(eq(customers.businessId, b.id), isNotNull(customers.consentAt)));
  const recent = await recentMessages(db, b.id, { limit: 8 });
  const allowance = await businessAllowance(db, b, now);
  return { used: await usedThisMonth(db, b.id, now), quota: allowance.quota, allowance: allowance.source, trialEndsAt: b.trialEndsAt, byStatus, customers: total, consented, recent };
}

export async function recentMessages(db: DB, businessId: string, opts: { limit?: number; status?: string; offset?: number } = {}) {
  const conds = [eq(bizMessages.businessId, businessId)];
  if (opts.status) conds.push(eq(bizMessages.status, opts.status as 'queued'));
  return db.select({ m: bizMessages, customerName: customers.name }).from(bizMessages)
    .leftJoin(customers, eq(customers.id, bizMessages.customerId))
    .where(and(...conds)).orderBy(desc(bizMessages.createdAt)).limit(Math.min(opts.limit ?? 50, 200)).offset(opts.offset ?? 0);
}

/** Customers with a birthday or anniversary in the next `days` days (business timezone). */
export async function upcomingCustomerDates(db: DB, b: Business, days = 7, now = new Date()) {
  const today = todayIn(b.timezone, now);
  const keys = Array.from({ length: days }, (_, i) => addDays(today, i));
  const out: { customer: typeof customers.$inferSelect; kind: 'birthday' | 'anniversary'; inDays: number }[] = [];
  for (const kind of ['birthday', 'anniversary'] as const) {
    const mCol = kind === 'birthday' ? customers.birthdayMonth : customers.anniversaryMonth;
    const dCol = kind === 'birthday' ? customers.birthdayDay : customers.anniversaryDay;
    const rows = await db.select().from(customers).where(and(eq(customers.businessId, b.id), or(...keys.map((k) => and(eq(mCol, k.m), eq(dCol, k.d))))));
    for (const c of rows) {
      const m = kind === 'birthday' ? c.birthdayMonth : c.anniversaryMonth, d = kind === 'birthday' ? c.birthdayDay : c.anniversaryDay;
      out.push({ customer: c, kind, inDays: keys.findIndex((k) => k.m === m && k.d === d) });
    }
  }
  return out.sort((a, b2) => a.inDays - b2.inDays).slice(0, 50);
}
