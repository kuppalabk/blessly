import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { files, users, wishlistItems, wishlistReservations, wishlists } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { sendEmail, type EmailProvider } from '../providers/email';
import { fileUrl, storageFromEnv, type Storage } from '../providers/storage';
import { notify } from './notify';
import { processImage } from './albums';
import { OCCASIONS, type OccasionId } from '@/lib/i18n-data';

export type Wishlist = typeof wishlists.$inferSelect;
export type Item = typeof wishlistItems.$inferSelect;

const uuid = z.string().uuid();
const occasionIds = OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]];
export const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED'] as const;
export const MAX_ITEMS = 200;
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const listSchema = z.object({
  title: z.string().trim().min(2, 'Give your list a name').max(100),
  description: optText(1000),
  occasion: z.enum(occasionIds).default('birthday'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => v || null),
  surprise: z.boolean().default(true),
  shippingNote: optText(500)
});

export const itemSchema = z.object({
  title: z.string().trim().min(1, 'What would you like?').max(150),
  url: z.string().trim().max(1000).refine((u) => /^https?:\/\/[^\s]+\.[^\s]+$/.test(u), 'Use a web link (https://…)').optional().nullable().or(z.literal('')).transform((v) => v || null),
  price: z.string().trim().regex(/^\d{1,9}([.,]\d{1,2})?$/, 'Enter a price like 1499 or 24.99').optional().nullable().or(z.literal('')).transform((v) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : null)),
  currency: z.enum(CURRENCIES).optional().nullable(),
  notes: optText(500),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  quantity: z.coerce.number().int().min(1).max(20).default(1)
});

export function formatMoney(minor: number | null, currency: string | null) {
  if (minor == null) return null;
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', { style: 'currency', currency: currency ?? 'INR', maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

async function loadOwn(db: DB, userId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Wishlist not found');
  const w = await db.query.wishlists.findFirst({ where: and(eq(wishlists.id, id), eq(wishlists.userId, userId)) });
  if (!w) throw notFound('Wishlist not found');
  return w;
}

export async function createWishlist(db: DB, userId: string, raw: unknown) {
  const input = listSchema.parse(raw);
  const [{ n }] = await db.select({ n: count() }).from(wishlists).where(eq(wishlists.userId, userId));
  if (n >= 50) throw badRequest('You can have up to 50 wishlists');
  const [w] = await db.insert(wishlists).values({ ...input, userId, slug: randomBytes(8).toString('base64url') }).returning();
  return w;
}

export async function updateWishlist(db: DB, userId: string, id: string, raw: unknown) {
  const w = await loadOwn(db, userId, id);
  const input = listSchema.partial().parse(raw);
  const [u] = await db.update(wishlists).set({ ...input, updatedAt: new Date() }).where(eq(wishlists.id, w.id)).returning();
  return u;
}

export async function deleteWishlist(db: DB, userId: string, id: string, storage: Storage = storageFromEnv()) {
  const w = await loadOwn(db, userId, id);
  const fs = await db.select({ id: files.id, key: files.key }).from(wishlistItems).innerJoin(files, eq(files.id, wishlistItems.fileId)).where(eq(wishlistItems.wishlistId, w.id));
  await db.delete(wishlists).where(eq(wishlists.id, w.id));
  if (fs.length) await db.delete(files).where(inArray(files.id, fs.map((f) => f.id)));
  await Promise.all(fs.map((f) => storage.delete(f.key).catch(() => undefined)));
}

export async function listWishlists(db: DB, userId: string) {
  const rows = await db.select().from(wishlists).where(eq(wishlists.userId, userId)).orderBy(desc(wishlists.updatedAt));
  if (!rows.length) return [];
  const counts = await db.select({ id: wishlistItems.wishlistId, n: count() }).from(wishlistItems).where(inArray(wishlistItems.wishlistId, rows.map((r) => r.id))).groupBy(wishlistItems.wishlistId);
  return rows.map((w) => ({ ...w, items: counts.find((c) => c.id === w.id)?.n ?? 0 }));
}

async function itemsWithTaken(db: DB, wishlistId: string) {
  const items = await db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, wishlistId)).orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt));
  const res = items.length ? await db.select().from(wishlistReservations).where(inArray(wishlistReservations.itemId, items.map((i) => i.id))).orderBy(asc(wishlistReservations.createdAt)) : [];
  return items.map((i) => {
    const mine = res.filter((r) => r.itemId === i.id);
    const taken = mine.reduce((s, r) => s + r.quantity, 0);
    return { item: i, reservations: mine, taken };
  });
}

const itemOut = (i: Item) => ({ id: i.id, title: i.title, url: i.url, price: formatMoney(i.price, i.currency), priceMinor: i.price, currency: i.currency, notes: i.notes, priority: i.priority, quantity: i.quantity, imageUrl: i.fileId ? fileUrl(i.fileId) : null });

/** The owner's view. In surprise mode, what's been reserved stays hidden until they reveal it. */
export async function ownerView(db: DB, userId: string, id: string) {
  const w = await loadOwn(db, userId, id);
  const show = !w.surprise || !!w.revealedAt;
  const rows = await itemsWithTaken(db, w.id);
  return {
    wishlist: w,
    hidden: !show,
    items: rows.map(({ item, reservations, taken }) => ({
      ...itemOut(item),
      taken: show ? taken : null,
      reservations: show ? reservations.map((r) => ({ id: r.id, name: r.name, quantity: r.quantity, purchased: r.purchased, thanked: !!r.thankedAt, hasEmail: !!r.email })) : []
    })),
    reservedCount: rows.reduce((s, r) => s + r.reservations.length, 0)
  };
}

export async function revealWishlist(db: DB, userId: string, id: string, now = new Date()) {
  const w = await loadOwn(db, userId, id);
  await db.update(wishlists).set({ revealedAt: w.revealedAt ?? now }).where(eq(wishlists.id, w.id));
}

export async function addItem(db: DB, userId: string, id: string, raw: unknown) {
  const w = await loadOwn(db, userId, id);
  const input = itemSchema.parse(raw);
  const [{ n }] = await db.select({ n: count() }).from(wishlistItems).where(eq(wishlistItems.wishlistId, w.id));
  if (n >= MAX_ITEMS) throw badRequest(`A list can have up to ${MAX_ITEMS} items`);
  const [{ last }] = await db.select({ last: max(wishlistItems.sortOrder) }).from(wishlistItems).where(eq(wishlistItems.wishlistId, w.id));
  const [i] = await db.insert(wishlistItems).values({ ...input, currency: input.price != null ? input.currency ?? 'INR' : null, wishlistId: w.id, sortOrder: (last ?? -1) + 1 }).returning();
  await db.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, w.id));
  return itemOut(i);
}

async function ownItem(db: DB, userId: string, id: string, itemId: string) {
  const w = await loadOwn(db, userId, id);
  if (!uuid.safeParse(itemId).success) throw notFound('Item not found');
  const i = await db.query.wishlistItems.findFirst({ where: and(eq(wishlistItems.id, itemId), eq(wishlistItems.wishlistId, w.id)) });
  if (!i) throw notFound('Item not found');
  return { w, i };
}

export async function updateItem(db: DB, userId: string, id: string, itemId: string, raw: unknown) {
  const { i } = await ownItem(db, userId, id, itemId);
  const input = itemSchema.partial().parse(raw);
  const [u] = await db.update(wishlistItems).set({ ...input, ...(input.price !== undefined ? { currency: input.price != null ? input.currency ?? i.currency ?? 'INR' : null } : {}) }).where(eq(wishlistItems.id, i.id)).returning();
  return itemOut(u);
}

export async function moveItem(db: DB, userId: string, id: string, itemId: string, dir: 'up' | 'down') {
  const { w } = await ownItem(db, userId, id, itemId);
  const items = await db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, w.id)).orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.createdAt));
  const at = items.findIndex((x) => x.id === itemId), to = dir === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= items.length) return;
  [items[at], items[to]] = [items[to], items[at]];
  await db.transaction(async (tx) => { for (const [k, x] of items.entries()) await tx.update(wishlistItems).set({ sortOrder: k }).where(eq(wishlistItems.id, x.id)); });
}

export async function deleteItem(db: DB, userId: string, id: string, itemId: string, storage: Storage = storageFromEnv()) {
  const { i } = await ownItem(db, userId, id, itemId);
  await db.delete(wishlistItems).where(eq(wishlistItems.id, i.id));
  if (i.fileId) {
    const f = await db.query.files.findFirst({ where: eq(files.id, i.fileId) });
    if (f) { await db.delete(files).where(eq(files.id, f.id)); await storage.delete(f.key).catch(() => undefined); }
  }
}

export async function setItemPhoto(db: DB, userId: string, id: string, itemId: string, file: { data: Buffer; type: string }, storage: Storage = storageFromEnv()) {
  const { i } = await ownItem(db, userId, id, itemId);
  if (file.data.length > 15 * 1024 * 1024) throw badRequest('Photos can be up to 15 MB');
  const img = await processImage(file.data);
  const fid = randomUUID(), key = `files/${userId}/${fid}.webp`;
  await storage.put(key, img.full, 'image/webp');
  await db.insert(files).values({ id: fid, ownerId: userId, kind: 'wishlist-photo', key, mime: 'image/webp', bytes: img.full.length, width: img.width, height: img.height });
  await db.update(wishlistItems).set({ fileId: fid }).where(eq(wishlistItems.id, i.id));
  if (i.fileId) {
    const old = await db.query.files.findFirst({ where: eq(files.id, i.fileId) });
    if (old) { await db.delete(files).where(eq(files.id, old.id)); await storage.delete(old.key).catch(() => undefined); }
  }
  return fileUrl(fid);
}

/* ---------------- Public list ---------------- */

async function bySlug(db: DB, s: string) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(s)) throw notFound('Wishlist not found');
  const w = await db.query.wishlists.findFirst({ where: eq(wishlists.slug, s) });
  if (!w) throw notFound('Wishlist not found');
  return w;
}

/** What friends see: every item and how many are still available (never who reserved what). */
export async function publicWishlist(db: DB, s: string, viewerId: string | null) {
  const w = await bySlug(db, s);
  const owner = (await db.query.users.findFirst({ where: eq(users.id, w.userId) }))!;
  const isOwner = viewerId === w.userId;
  const rows = await itemsWithTaken(db, w.id);
  const showTaken = !isOwner || !w.surprise || !!w.revealedAt;
  return {
    wishlist: { title: w.title, description: w.description, occasion: w.occasion as OccasionId, eventDate: w.eventDate, shippingNote: w.shippingNote, ownerName: owner.name, slug: w.slug, surprise: w.surprise },
    isOwner,
    items: rows.map(({ item, taken }) => ({ ...itemOut(item), remaining: showTaken ? Math.max(0, item.quantity - taken) : null }))
  };
}

export const reserveSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(80),
  email: z.string().trim().toLowerCase().email('Check your email').max(200).optional().or(z.literal('')).transform((v) => v || null),
  quantity: z.coerce.number().int().min(1).max(20).default(1)
});

export async function reserveItem(db: DB, s: string, itemId: string, raw: unknown, viewerId: string | null = null) {
  const w = await bySlug(db, s);
  if (viewerId === w.userId) throw badRequest('This is your own list — friends reserve gifts from it');
  if (!uuid.safeParse(itemId).success) throw notFound('Item not found');
  const input = reserveSchema.parse(raw);
  const t = randomBytes(16).toString('base64url');
  const r = await db.transaction(async (tx) => {
    // Lock the item so two people can't take the last one at the same moment.
    const [i] = await tx.select().from(wishlistItems).where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.wishlistId, w.id))).for('update');
    if (!i) throw notFound('Item not found');
    const [{ taken }] = await tx.select({ taken: sql<number>`coalesce(sum(${wishlistReservations.quantity}), 0)::int` }).from(wishlistReservations).where(eq(wishlistReservations.itemId, i.id));
    if (taken + input.quantity > i.quantity) throw new AppError(409, 'taken', i.quantity - taken > 0 ? `Only ${i.quantity - taken} left` : 'Someone already reserved this');
    const [row] = await tx.insert(wishlistReservations).values({ itemId: i.id, name: input.name, email: input.email, quantity: input.quantity, token: t, userId: viewerId }).returning();
    return { row, item: i };
  });
  await notify(db, [w.userId], w.surprise ? { title: 'Someone reserved a gift from your list', body: `${w.title} — it’s a surprise!`, link: `/wishlists/${w.id}` } : { title: `${input.name} reserved “${r.item.title}”`, body: w.title, link: `/wishlists/${w.id}` });
  return { token: t, itemId: r.item.id, quantity: r.row.quantity };
}

async function reservationByToken(db: DB, t: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(t)) throw notFound('Reservation not found');
  const r = await db.query.wishlistReservations.findFirst({ where: eq(wishlistReservations.token, t) });
  if (!r) throw notFound('Reservation not found');
  return r;
}

/** Reservations the visitor made (their browser keeps the tokens). */
export async function myReservations(db: DB, tokens: string[]) {
  const ok = tokens.filter((t) => /^[A-Za-z0-9_-]{10,40}$/.test(t)).slice(0, 100);
  if (!ok.length) return [];
  return (await db.select().from(wishlistReservations).where(inArray(wishlistReservations.token, ok))).map((r) => ({ itemId: r.itemId, token: r.token, quantity: r.quantity, purchased: r.purchased }));
}

export async function cancelReservation(db: DB, t: string) {
  const r = await reservationByToken(db, t);
  await db.delete(wishlistReservations).where(eq(wishlistReservations.id, r.id));
}

export async function markPurchased(db: DB, t: string, purchased: boolean) {
  const r = await reservationByToken(db, t);
  await db.update(wishlistReservations).set({ purchased }).where(eq(wishlistReservations.id, r.id));
}

/** Thank everyone who gave a gift (after revealing a surprise list). */
export async function thankGivers(db: DB, userId: string, id: string, raw: unknown, email: EmailProvider, now = new Date()) {
  const w = await loadOwn(db, userId, id);
  if (w.surprise && !w.revealedAt) throw badRequest('Reveal your gifts first');
  const { message } = z.object({ message: z.string().trim().min(3, 'Write a thank-you message').max(2000) }).parse(raw);
  const owner = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  const rows = await db.select({ r: wishlistReservations, title: wishlistItems.title }).from(wishlistReservations).innerJoin(wishlistItems, eq(wishlistItems.id, wishlistReservations.itemId)).where(eq(wishlistItems.wishlistId, w.id));
  let emailed = 0;
  for (const { r, title } of rows) {
    if (!r.email || r.thankedAt) continue;
    await sendEmail(db, email, { to: r.email, subject: `Thank you from ${owner.name}`, text: `Hi ${r.name},\n\n${message}\n\n(For: ${title})\n\n— ${owner.name}` });
    await db.update(wishlistReservations).set({ thankedAt: now }).where(eq(wishlistReservations.id, r.id));
    emailed++;
  }
  return { emailed };
}
