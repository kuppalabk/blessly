import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { checkWishAttachments } from './designs';
import type { DB } from '../db';
import { people, scheduledSends, signatures, wishes, wishPages } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { LANGUAGES, OCCASIONS } from '@/lib/i18n-data';
import { TONES } from '@/lib/wishes/templates';
import { generateWish, type WishProvider } from '@/lib/wishes/generate';
import { normalizePhone } from '@/lib/send-links';
import { getVisiblePerson } from './people';

const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];
const occasionIds = OCCASIONS.map((o) => o.id) as [string, ...string[]];
const uuid = z.string().uuid();

export const draftSchema = z.object({
  occasion: z.enum(occasionIds),
  language: z.enum(languageCodes),
  tone: z.enum(TONES as [string, ...string[]]),
  recipientName: z.string().trim().min(1, 'Who is this for?').max(80),
  relationship: z.string().trim().max(40).optional(),
  senderName: z.string().trim().max(80).optional(),
  detail: z.string().trim().max(200).optional(),
  variant: z.coerce.number().int().min(0).max(50).optional()
});

export async function draftWish(raw: unknown, provider?: WishProvider | null) {
  const input = draftSchema.parse(raw) as Parameters<typeof generateWish>[0];
  return provider === undefined ? generateWish(input) : generateWish(input, provider);
}

export const saveSchema = z.object({
  personId: uuid.optional().nullable(),
  occasion: z.enum(occasionIds),
  language: z.enum(languageCodes),
  tone: z.enum(TONES as [string, ...string[]]),
  text: z.string().trim().min(1, 'The wish is empty').max(2000),
  designIndex: z.coerce.number().int().min(0).max(249).default(0),
  recipientName: z.string().trim().min(1).max(80),
  senderName: z.string().trim().min(1).max(80),
  cardDraftId: uuid.optional().nullable(),
  messageFileId: uuid.optional().nullable()
});

export async function saveWish(db: DB, userId: string, raw: unknown) {
  const input = saveSchema.parse(raw);
  // Your own people, or people shared with one of your family circles.
  if (input.personId) await getVisiblePerson(db, userId, input.personId, 'UTC');
  await checkWishAttachments(db, userId, input);
  const [w] = await db.insert(wishes).values({ ...input, personId: input.personId ?? null, cardDraftId: input.cardDraftId ?? null, messageFileId: input.messageFileId ?? null, userId }).returning();
  return w;
}

export async function getWish(db: DB, userId: string, wishId: string) {
  if (!uuid.safeParse(wishId).success) throw notFound('Wish not found');
  const w = await db.query.wishes.findFirst({ where: and(eq(wishes.id, wishId), eq(wishes.userId, userId)) });
  if (!w) throw notFound('Wish not found');
  const page = await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, w.id) });
  const person = w.personId ? await db.query.people.findFirst({ where: eq(people.id, w.personId) }) : null;
  const sends = await db.select().from(scheduledSends).where(eq(scheduledSends.wishId, w.id)).orderBy(asc(scheduledSends.sendAt));
  return { wish: w, page: page ?? null, person: person ?? null, sends };
}

export async function listWishes(db: DB, userId: string, limit = 50) {
  return db.select().from(wishes).where(eq(wishes.userId, userId)).orderBy(desc(wishes.createdAt)).limit(limit);
}

function newSlug() {
  return randomBytes(9).toString('base64url'); // 12 chars, ~72 bits
}

/** Creates the shareable wish page for a wish (idempotent). */
export async function publishWishPage(db: DB, userId: string, wishId: string) {
  const { wish, page } = await getWish(db, userId, wishId);
  if (page) return page;
  const [p] = await db.insert(wishPages).values({ wishId: wish.id, slug: newSlug() }).onConflictDoNothing().returning();
  return p ?? (await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, wish.id) }))!;
}

/** Public: the wish page a recipient opens. Counts a view unless `countView` is false. */
export async function getPublicWishPage(db: DB, slug: string, countView = true) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) throw notFound('Wish page not found');
  const page = await db.query.wishPages.findFirst({ where: eq(wishPages.slug, slug) });
  if (!page) throw notFound('Wish page not found');
  if (countView) await db.update(wishPages).set({ views: sql`${wishPages.views} + 1` }).where(eq(wishPages.id, page.id));
  const wish = (await db.query.wishes.findFirst({ where: eq(wishes.id, page.wishId) }))!;
  const sigs = await db.select().from(signatures).where(eq(signatures.wishPageId, page.id)).orderBy(asc(signatures.createdAt));
  return { page, wish, signatures: sigs };
}

export const MAX_SIGNATURES = 200;
export const signatureSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(60),
  message: z.string().trim().min(1, 'Write a short message').max(500)
});

/** Anyone with the link can sign. `userId` is recorded when a logged-in user signs (for family progress). */
export async function addSignature(db: DB, slug: string, raw: unknown, userId: string | null = null) {
  const input = signatureSchema.parse(raw);
  const { page } = await getPublicWishPage(db, slug, false);
  if (!page.allowSignatures) throw new AppError(403, 'closed', 'This wish page is not accepting messages');
  const [{ n }] = await db.select({ n: count() }).from(signatures).where(eq(signatures.wishPageId, page.id));
  if (n >= MAX_SIGNATURES) throw new AppError(409, 'full', 'This wish page is full');
  const [s] = await db.insert(signatures).values({ wishPageId: page.id, ...input, userId }).returning();
  return s;
}

export const scheduleSchema = z.object({
  channel: z.enum(['email', 'sms', 'whatsapp', 'telegram', 'link']),
  recipient: z.string().trim().max(200).default(''),
  sendAt: z.coerce.date()
});

/**
 * Schedules a wish. Email is sent automatically at `sendAt`.
 * Chat apps (WhatsApp, Telegram, SMS from the user's own phone) can't be automated for
 * personal accounts, so at `sendAt` the user gets a reminder with the message ready to send.
 */
export async function scheduleSend(db: DB, userId: string, wishId: string, raw: unknown, country = 'IN', now = new Date()) {
  const input = scheduleSchema.parse(raw);
  await getWish(db, userId, wishId);
  if (input.sendAt.getTime() < now.getTime() - 60000) throw badRequest('Pick a time in the future');
  if (input.sendAt.getTime() > now.getTime() + 366 * 86400000) throw badRequest('You can schedule up to a year ahead');
  let recipient = input.recipient;
  if (input.channel === 'email') {
    if (!z.string().email().safeParse(recipient).success) throw badRequest('Enter a valid email address');
    recipient = recipient.toLowerCase();
  } else if (input.channel === 'sms' || input.channel === 'whatsapp') {
    const p = normalizePhone(recipient, country);
    if (!p) throw badRequest('Enter a valid phone number');
    recipient = p;
  }
  const [s] = await db.insert(scheduledSends).values({ userId, wishId, channel: input.channel, recipient, sendAt: input.sendAt }).returning();
  return s;
}

export async function cancelSend(db: DB, userId: string, sendId: string) {
  if (!uuid.safeParse(sendId).success) throw notFound('Scheduled send not found');
  const [s] = await db.update(scheduledSends).set({ status: 'cancelled' })
    .where(and(eq(scheduledSends.id, sendId), eq(scheduledSends.userId, userId), eq(scheduledSends.status, 'scheduled'))).returning();
  if (!s) throw notFound('Scheduled send not found');
  return s;
}
