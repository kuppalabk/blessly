import { cfg } from '../settings';
import { applyPromo, recordRedemption, PURPOSE_LABEL, assertPromotions, type Purpose } from './promotions';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { cardDrafts, celebrations, collections, communityDesigns, contributions, files, giftCards, orders, partners, products, users, wishlistItems } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { decrypt } from '../crypto';
import { fileUrl, storageFromEnv, type Storage } from '../providers/storage';
import { processImage } from './albums';
import { notify } from './notify';
import { account, assertMoney, balance, createPayment, listPayouts } from './money';
import { BRANDS, brand } from '@/lib/giftcards';
import { CURRENCIES, LIMITS, formatMoney, type Currency } from '@/lib/money';
import { OCCASIONS, type OccasionId } from '@/lib/i18n-data';

const uuid = z.string().uuid();
const occasionIds = OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]];
const money = z.coerce.number().int().positive();
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const email = z.string().trim().toLowerCase().email('Check the email address').max(200);
const slug = () => randomBytes(8).toString('base64url');
function inLimits(amount: number, currency: Currency) {
  const [min, max] = LIMITS[currency];
  if (amount < min) throw badRequest(`The minimum is ${formatMoney(min, currency)}`);
  if (amount > max) throw badRequest(`The maximum is ${formatMoney(max, currency)}`);
}

/* ================= Group gifts and fundraisers ================= */

export const collectionSchema = z.object({
  kind: z.enum(['gift', 'fundraiser']),
  title: z.string().trim().min(3, 'Give it a name').max(100),
  story: optText(3000),
  recipientName: optText(80),
  currency: z.enum(CURRENCIES),
  target: money.optional().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => v || null),
  charityId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  celebrationId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  wishlistItemId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null),
  showAmounts: z.boolean().default(true)
});

export async function createCollection(db: DB, userId: string, raw: unknown) {
  assertMoney();
  const input = collectionSchema.parse(raw);
  if (input.target) inLimits(input.target, input.currency);
  if (input.charityId) {
    const ch = await db.query.partners.findFirst({ where: and(eq(partners.id, input.charityId), eq(partners.kind, 'charity'), eq(partners.status, 'approved')) });
    if (!ch) throw badRequest('Choose a verified charity');
  }
  if (input.kind === 'gift' && input.charityId) throw badRequest('Group gifts go to the organiser, not a charity');
  if (input.celebrationId && !(await db.query.celebrations.findFirst({ where: and(eq(celebrations.id, input.celebrationId), eq(celebrations.userId, userId)) }))) throw badRequest('Choose one of your celebrations');
  if (input.wishlistItemId && !(await db.query.wishlistItems.findFirst({ where: eq(wishlistItems.id, input.wishlistItemId) }))) throw badRequest('That wishlist item no longer exists');
  const deadline = input.deadline ? new Date(`${input.deadline}T23:59:59Z`) : null;
  if (deadline && deadline < new Date()) throw badRequest('Choose a closing date in the future');
  const [c] = await db.insert(collections).values({ ...input, deadline, target: input.target ?? null, userId, slug: slug() }).returning();
  return c;
}

async function ownCollection(db: DB, userId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Not found');
  const c = await db.query.collections.findFirst({ where: and(eq(collections.id, id), eq(collections.userId, userId)) });
  if (!c) throw notFound('Not found');
  return c;
}

async function raised(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, { total: number; count: number }>();
  const rows = await db.select({ id: contributions.collectionId, total: sql<number>`coalesce(sum(${contributions.amount}),0)::int`, count: sql<number>`count(*)::int` }).from(contributions).where(and(inArray(contributions.collectionId, ids), eq(contributions.status, 'paid'))).groupBy(contributions.collectionId);
  return new Map(rows.map((r) => [r.id, { total: r.total, count: r.count }]));
}

export async function listCollections(db: DB, userId: string) {
  assertMoney();
  const rows = await db.select().from(collections).where(eq(collections.userId, userId)).orderBy(desc(collections.createdAt));
  const r = await raised(db, rows.map((x) => x.id));
  return rows.map((c) => ({ ...c, raised: r.get(c.id)?.total ?? 0, contributors: r.get(c.id)?.count ?? 0 }));
}

export async function organiserView(db: DB, userId: string, id: string) {
  assertMoney();
  const c = await ownCollection(db, userId, id);
  const list = await db.select().from(contributions).where(and(eq(contributions.collectionId, c.id), eq(contributions.status, 'paid'))).orderBy(desc(contributions.paidAt));
  const charity = c.charityId ? await db.query.partners.findFirst({ where: eq(partners.id, c.charityId) }) : null;
  const acct = account.collection(c.id);
  return { collection: c, contributions: list, raised: list.reduce((s, x) => s + x.amount, 0), charity: charity ? { name: charity.name } : null, balance: c.charityId ? {} : await balance(db, acct), payouts: c.charityId ? [] : await listPayouts(db, acct) };
}

export async function closeCollection(db: DB, userId: string, id: string, now = new Date()) {
  const c = await ownCollection(db, userId, id);
  await db.update(collections).set({ closedAt: c.closedAt ?? now }).where(eq(collections.id, c.id));
}

const isOpen = (c: typeof collections.$inferSelect, now = new Date()) => !c.closedAt && (!c.deadline || c.deadline > now);

export async function publicCollection(db: DB, s: string, now = new Date()) {
  assertMoney();
  if (!/^[\w-]{6,40}$/.test(s)) throw notFound('Not found');
  const c = await db.query.collections.findFirst({ where: eq(collections.slug, s) });
  if (!c) throw notFound('Not found');
  const organiser = (await db.query.users.findFirst({ where: eq(users.id, c.userId) }))!;
  const charity = c.charityId ? await db.query.partners.findFirst({ where: eq(partners.id, c.charityId) }) : null;
  const list = await db.select().from(contributions).where(and(eq(contributions.collectionId, c.id), eq(contributions.status, 'paid'))).orderBy(desc(contributions.paidAt)).limit(200);
  const total = (await raised(db, [c.id])).get(c.id) ?? { total: 0, count: 0 };
  const item = c.wishlistItemId ? await db.query.wishlistItems.findFirst({ where: eq(wishlistItems.id, c.wishlistItemId) }) : null;
  return {
    collection: { kind: c.kind as 'gift' | 'fundraiser', title: c.title, story: c.story, recipientName: c.recipientName, currency: c.currency as Currency, target: c.target, deadline: c.deadline?.toISOString() ?? null, open: isOpen(c, now), slug: c.slug, showAmounts: c.showAmounts, organiser: organiser.name, charity: charity ? { name: charity.name, regNumber: charity.regNumber, country: charity.country } : null, item: item ? { title: item.title } : null },
    raised: total.total, count: total.count,
    supporters: list.map((x) => ({ name: x.anonymous ? 'Anonymous' : x.name, message: x.message, amount: c.showAmounts ? x.amount : null, at: x.paidAt!.toISOString() }))
  };
}

export const contributeSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(80),
  email: email.optional().or(z.literal('')).transform((v) => v || null),
  message: optText(500),
  anonymous: z.boolean().default(false),
  amount: money
});

export async function contribute(db: DB, s: string, raw: unknown, viewerId: string | null, now = new Date()) {
  assertMoney();
  const c = await db.query.collections.findFirst({ where: eq(collections.slug, String(s)) });
  if (!c) throw notFound('Not found');
  if (!isOpen(c, now)) throw badRequest('This collection has closed');
  const input = contributeSchema.parse(raw);
  inLimits(input.amount, c.currency as Currency);
  const [row] = await db.insert(contributions).values({ ...input, collectionId: c.id, userId: viewerId, currency: c.currency }).returning();
  return createPayment(db, { userId: viewerId, purpose: 'contribution', refId: row.id, amount: input.amount, currency: c.currency, email: input.email, description: `${c.kind === 'fundraiser' ? 'Donation' : 'Contribution'}: ${c.title}`, returnUrl: `/p/${c.slug}?thanks=1` });
}

/** Open pots for a celebration or wishlist (shown on those pages). */
export async function potsFor(db: DB, where: { celebrationId?: string; wishlistItemIds?: string[] }) {
  if (cfg('MONEY_FEATURES') !== '1') return [];
  const cond = where.celebrationId ? eq(collections.celebrationId, where.celebrationId) : where.wishlistItemIds?.length ? inArray(collections.wishlistItemId, where.wishlistItemIds) : null;
  if (!cond) return [];
  const rows = (await db.select().from(collections).where(cond)).filter((c) => isOpen(c));
  const r = await raised(db, rows.map((x) => x.id));
  return rows.map((c) => ({ slug: c.slug, title: c.title, wishlistItemId: c.wishlistItemId, raised: r.get(c.id)?.total ?? 0, target: c.target, currency: c.currency }));
}

/* ================= Gift cards ================= */

export const promoCodeInput = z.string().trim().max(40).optional().transform((v) => v || undefined);

export const giftCardSchema = z.object({
  brand: z.string(),
  currency: z.enum(CURRENCIES),
  value: money,
  recipientName: z.string().trim().min(1, 'Who is it for?').max(80),
  recipientEmail: email,
  message: optText(300),
  deliverOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform((v) => v || null),
  promoCode: promoCodeInput
});

export async function buyGiftCard(db: DB, user: { id: string; email: string; timezone: string }, raw: unknown, now = new Date()) {
  assertMoney();
  const input = giftCardSchema.parse(raw);
  const b = brand(input.brand);
  if (!b) throw badRequest('Choose a gift card');
  if (!(b.denominations[input.currency] ?? []).includes(input.value)) throw badRequest('Choose one of the amounts shown');
  const deliverAt = input.deliverOn ? new Date(`${input.deliverOn}T09:00:00Z`) : now;
  if (deliverAt.getTime() > now.getTime() + 366 * 86400000) throw badRequest('Choose a date within a year');
  const orderId = randomUUID();
  const amount = await db.transaction(async (tx) => {
    const q = input.promoCode ? await applyPromo(tx, { code: input.promoCode, purpose: 'giftcard', baseAmount: input.value, currency: input.currency, userId: user.id, now }) : null;
    const paid = q ? q.finalAmount : input.value;
    await tx.insert(orders).values({ id: orderId, userId: user.id, kind: 'giftcard', amount: paid, currency: input.currency, details: JSON.stringify({ brand: b.id, title: `${b.name} gift card`, recipientName: input.recipientName, recipientEmail: input.recipientEmail, ...(q ? { promo: { code: q.code, base: input.value, discount: q.discount } } : {}) }) });
    if (q) await recordRedemption(tx, q, orderId, user.id);
    await tx.insert(giftCards).values({ orderId, brand: b.id, value: input.value, currency: input.currency, recipientName: input.recipientName, recipientEmail: input.recipientEmail, message: input.message, deliverAt: deliverAt < now ? now : deliverAt, token: randomBytes(18).toString('base64url') });
    return paid;
  });
  return createPayment(db, { userId: user.id, purpose: 'giftcard', refId: orderId, amount, currency: input.currency, email: user.email, description: `${b.name} gift card ${formatMoney(input.value, input.currency)} for ${input.recipientName}`, returnUrl: '/orders?paid=1' });
}

/** The recipient's page. The code is only shown here (never in emails or lists). */
export async function openGiftCard(db: DB, token: string) {
  assertMoney();
  if (!/^[\w-]{20,40}$/.test(token)) throw notFound('Gift card not found');
  const gc = await db.query.giftCards.findFirst({ where: eq(giftCards.token, token) });
  if (!gc || !gc.codeEnc || !gc.deliveredAt) throw notFound('Gift card not found');
  const o = (await db.query.orders.findFirst({ where: eq(orders.id, gc.orderId) }))!;
  if (o.status === 'refunded') throw new AppError(410, 'refunded', 'This gift card was cancelled');
  const from = o.userId ? await db.query.users.findFirst({ where: eq(users.id, o.userId) }) : null;
  const b = brand(gc.brand)!;
  return { brand: { name: b.name, emoji: b.emoji, color: b.color, terms: b.terms }, value: formatMoney(gc.value, gc.currency)!, recipientName: gc.recipientName, from: from?.name ?? 'A friend', message: gc.message, code: decrypt(gc.codeEnc), pin: gc.pinEnc ? decrypt(gc.pinEnc) : null, expiresOn: gc.expiresOn };
}

export const giftCardCatalogue = () => BRANDS;

export async function myOrders(db: DB, userId: string) {
  assertMoney();
  const rows = await db.select().from(orders).where(and(eq(orders.userId, userId), sql`${orders.status} <> 'pending_payment'`)).orderBy(desc(orders.createdAt)).limit(100);
  return rows.map((o) => ({ id: o.id, kind: o.kind, status: o.status, amount: formatMoney(o.amount, o.currency)!, createdAt: o.createdAt.toISOString(), tracking: o.tracking, title: (JSON.parse(o.details) as { title?: string }).title ?? o.kind }));
}

/* ================= Partners: sellers, designers, charities ================= */

export const partnerSchema = z.object({
  kind: z.enum(['seller', 'designer', 'charity']),
  name: z.string().trim().min(2, 'Add a name').max(120),
  country: z.string().trim().length(2).toUpperCase(),
  website: z.string().trim().max(300).refine((u) => /^https:\/\/[^\s]+\.[^\s]+$/.test(u), 'Use a link starting with https://').optional().nullable().or(z.literal('')).transform((v) => v || null),
  regNumber: optText(80),
  description: optText(2000)
});

export async function applyPartner(db: DB, userId: string, raw: unknown) {
  assertMoney();
  const input = partnerSchema.parse(raw);
  if (input.kind === 'charity' && !input.regNumber) throw badRequest('Add your charity registration number (e.g. 12A/80G in India, Charity Commission number in the UK, EIN in the US)');
  const existing = await db.query.partners.findFirst({ where: and(eq(partners.userId, userId), eq(partners.kind, input.kind)) });
  if (existing && existing.status !== 'rejected') throw badRequest('You’ve already applied');
  if (existing) { const [p] = await db.update(partners).set({ ...input, status: 'pending', reviewNote: null, reviewedAt: null }).where(eq(partners.id, existing.id)).returning(); return p; }
  const [p] = await db.insert(partners).values({ ...input, userId }).returning();
  return p;
}

export async function myPartnerships(db: DB, userId: string) {
  assertMoney();
  const ps = await db.select().from(partners).where(eq(partners.userId, userId)).orderBy(asc(partners.createdAt));
  return Promise.all(ps.map(async (p) => {
    const acct = account.partner(p.id);
    const base = { partner: p, balance: await balance(db, acct), payouts: await listPayouts(db, acct) };
    if (p.kind === 'seller') {
      const prods = await db.select().from(products).where(eq(products.partnerId, p.id)).orderBy(desc(products.createdAt));
      const ords = await db.select().from(orders).where(and(eq(orders.partnerId, p.id), inArray(orders.status, ['paid', 'shipped', 'delivered']))).orderBy(desc(orders.createdAt)).limit(100);
      return { ...base, products: prods.map((x) => ({ ...x, imageUrl: x.fileId ? fileUrl(x.fileId) : null, priceText: formatMoney(x.price, x.currency) })), orders: ords.map((o) => ({ id: o.id, status: o.status, amount: formatMoney(o.amount, o.currency), createdAt: o.createdAt.toISOString(), tracking: o.tracking, details: JSON.parse(o.details) as Record<string, unknown> })), designs: [], donations: [] };
    }
    if (p.kind === 'designer') {
      const ds = await db.select().from(communityDesigns).where(eq(communityDesigns.partnerId, p.id)).orderBy(desc(communityDesigns.createdAt));
      return { ...base, products: [], orders: [], designs: ds.map((d) => ({ ...d, imageUrl: fileUrl(d.fileId) })), donations: [] };
    }
    const fundraisers = await db.select({ c: contributions, title: collections.title }).from(contributions).innerJoin(collections, eq(collections.id, contributions.collectionId)).where(and(eq(collections.charityId, p.id), eq(contributions.status, 'paid'))).orderBy(desc(contributions.paidAt)).limit(100);
    return { ...base, products: [], orders: [], designs: [], donations: fundraisers.map(({ c, title }) => ({ name: c.anonymous ? 'Anonymous' : c.name, amount: formatMoney(c.amount, c.currency), fundraiser: title, at: c.paidAt!.toISOString() })) };
  }));
}

async function approvedPartner(db: DB, userId: string, kind: 'seller' | 'designer') {
  const p = await db.query.partners.findFirst({ where: and(eq(partners.userId, userId), eq(partners.kind, kind)) });
  if (!p || p.status !== 'approved') throw new AppError(403, 'not_approved', `Your ${kind} account isn’t approved yet`);
  return p;
}

export const productSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optText(2000),
  price: money,
  currency: z.enum(CURRENCIES),
  stock: z.coerce.number().int().min(0).max(100000),
  countries: z.string().trim().toUpperCase().regex(/^[A-Z]{2}(,[A-Z]{2})*$/, 'Use country codes like IN,GB').default('IN')
});

export async function addProduct(db: DB, userId: string, raw: unknown) {
  assertMoney();
  const p = await approvedPartner(db, userId, 'seller');
  const input = productSchema.parse(raw);
  inLimits(input.price, input.currency);
  const [row] = await db.insert(products).values({ ...input, partnerId: p.id }).returning();
  return row;
}

async function ownProduct(db: DB, userId: string, id: string) {
  const p = await approvedPartner(db, userId, 'seller');
  if (!uuid.safeParse(id).success) throw notFound('Not found');
  const pr = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.partnerId, p.id)) });
  if (!pr) throw notFound('Not found');
  return pr;
}

/** Stock and on/off can change freely; changing what's sold sends it back for review. */
export async function updateProduct(db: DB, userId: string, id: string, raw: unknown) {
  const pr = await ownProduct(db, userId, id);
  const input = productSchema.partial().extend({ active: z.boolean().optional() }).parse(raw);
  const material = ['title', 'description', 'price', 'currency'].some((k) => k in input && (input as Record<string, unknown>)[k] !== (pr as Record<string, unknown>)[k]);
  const [u] = await db.update(products).set({ ...input, ...(material ? { status: 'pending' } : {}) }).where(eq(products.id, pr.id)).returning();
  return u;
}

export async function setProductPhoto(db: DB, userId: string, id: string, file: { data: Buffer }, storage: Storage = storageFromEnv()) {
  const pr = await ownProduct(db, userId, id);
  const img = await processImage(file.data);
  const fid = randomUUID(), key = `files/${userId}/${fid}.webp`;
  await storage.put(key, img.full, 'image/webp');
  await db.insert(files).values({ id: fid, ownerId: userId, kind: 'product-photo', key, mime: 'image/webp', bytes: img.full.length, width: img.width, height: img.height });
  await db.update(products).set({ fileId: fid, status: 'pending' }).where(eq(products.id, pr.id));
  return fileUrl(fid);
}

export async function updateSellerOrder(db: DB, userId: string, orderId: string, raw: unknown) {
  const p = await approvedPartner(db, userId, 'seller');
  const { status, tracking } = z.object({ status: z.enum(['shipped', 'delivered', 'cancelled']), tracking: optText(80) }).parse(raw);
  if (!uuid.safeParse(orderId).success) throw notFound('Not found');
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.partnerId, p.id)) });
  if (!o || !['paid', 'shipped'].includes(o.status)) throw notFound('Not found');
  if (status === 'cancelled') throw badRequest('Ask Blessly support to cancel and refund an order');
  await db.update(orders).set({ status, tracking: tracking ?? o.tracking, updatedAt: new Date() }).where(eq(orders.id, o.id));
  if (o.userId) await notify(db, [o.userId], { title: status === 'shipped' ? 'Your order is on its way' : 'Your order was delivered', body: `${(JSON.parse(o.details) as { title: string }).title}${tracking ? ` · Tracking: ${tracking}` : ''}`, link: '/orders' });
}

/* ---- Shop ---- */

export async function shopProducts(db: DB, country?: string) {
  assertMoney();
  const rows = await db.select({ p: products, seller: partners.name }).from(products).innerJoin(partners, eq(partners.id, products.partnerId))
    .where(and(eq(products.status, 'approved'), eq(products.active, true), gt(products.stock, 0), eq(partners.status, 'approved'))).orderBy(desc(products.createdAt)).limit(200);
  return rows.filter(({ p }) => !country || p.countries.split(',').includes(country)).map(({ p, seller }) => ({ id: p.id, title: p.title, description: p.description, price: formatMoney(p.price, p.currency)!, priceMinor: p.price, currency: p.currency, stock: p.stock, seller, countries: p.countries.split(','), imageUrl: p.fileId ? fileUrl(p.fileId) : null }));
}

export const addressSchema = z.object({
  name: z.string().trim().min(1, 'Add the recipient’s name').max(80),
  line1: z.string().trim().min(2, 'Add the address').max(120),
  line2: optText(120),
  city: z.string().trim().min(1, 'Add the town or city').max(80),
  state: optText(80),
  postcode: z.string().trim().min(2, 'Add the postcode / PIN').max(12),
  country: z.string().trim().length(2).toUpperCase(),
  phone: optText(20)
});

export async function buyProduct(db: DB, user: { id: string; email: string }, raw: unknown) {
  assertMoney();
  const { productId, quantity, address, giftMessage, promoCode } = z.object({ productId: uuid, quantity: z.coerce.number().int().min(1).max(20).default(1), address: addressSchema, giftMessage: optText(300), promoCode: promoCodeInput }).parse(raw);
  const r = (await db.select({ p: products, s: partners }).from(products).innerJoin(partners, eq(partners.id, products.partnerId)).where(eq(products.id, productId)))[0];
  if (!r || r.p.status !== 'approved' || !r.p.active || r.s.status !== 'approved') throw notFound('That product isn’t available');
  if (r.s.userId === user.id) throw badRequest('You can’t buy your own product');
  if (!r.p.countries.split(',').includes(address.country)) throw badRequest(`${r.s.name} doesn’t deliver to that country`);
  if (r.p.stock < quantity) throw badRequest(r.p.stock ? `Only ${r.p.stock} left` : 'Sold out');
  const base = r.p.price * quantity;
  const { o, amount } = await db.transaction(async (tx) => {
    const q = promoCode ? await applyPromo(tx, { code: promoCode, purpose: 'shop', baseAmount: base, currency: r.p.currency, userId: user.id }) : null;
    const paid = q ? q.finalAmount : base;
    const [row] = await tx.insert(orders).values({ userId: user.id, kind: 'shop', amount: paid, currency: r.p.currency, partnerId: r.s.id, details: JSON.stringify({ productId, quantity, title: `${r.p.title}${quantity > 1 ? ` × ${quantity}` : ''}`, address, giftMessage, ...(q ? { promo: { code: q.code, base, discount: q.discount } } : {}) }) }).returning();
    if (q) await recordRedemption(tx, q, row.id, user.id);
    return { o: row, amount: paid };
  });
  return createPayment(db, { userId: user.id, purpose: 'shop', refId: o.id, amount, currency: r.p.currency, email: user.email, description: `${r.p.title}${quantity > 1 ? ` × ${quantity}` : ''} from ${r.s.name}`, returnUrl: '/orders?paid=1' });
}

/* ---- Designers ---- */

export async function submitDesign(db: DB, userId: string, raw: unknown, file: { data: Buffer }, storage: Storage = storageFromEnv()) {
  assertMoney();
  const p = await approvedPartner(db, userId, 'designer');
  const { title, occasion } = z.object({ title: z.string().trim().min(2).max(80), occasion: z.enum(occasionIds) }).parse(raw);
  const img = await processImage(file.data);
  if (Math.abs(img.width / img.height - 0.75) > 0.06) throw badRequest('Designs need to be portrait, 3:4 (for example 1500 × 2000 pixels)');
  if (img.width < 900) throw badRequest('Designs need to be at least 900 pixels wide for printing');
  const fid = randomUUID(), key = `files/${userId}/${fid}.webp`;
  await storage.put(key, img.full, 'image/webp');
  await db.insert(files).values({ id: fid, ownerId: userId, kind: 'community-design', key, mime: 'image/webp', bytes: img.full.length, width: img.width, height: img.height });
  const [d] = await db.insert(communityDesigns).values({ partnerId: p.id, title, occasion, fileId: fid }).returning();
  return d;
}

export async function communityDesignList(db: DB, occasion?: string) {
  if (cfg('MONEY_FEATURES') !== '1') return [];
  const rows = await db.select({ d: communityDesigns, by: partners.name }).from(communityDesigns).innerJoin(partners, eq(partners.id, communityDesigns.partnerId))
    .where(and(eq(communityDesigns.status, 'approved'), eq(partners.status, 'approved'), ...(occasion ? [eq(communityDesigns.occasion, occasion)] : []))).orderBy(desc(communityDesigns.uses)).limit(60);
  return rows.map(({ d, by }) => ({ id: d.id, title: d.title, occasion: d.occasion, by, imageUrl: fileUrl(d.fileId) }));
}

/** Puts a community design on a card: copies the image into the user's own card photos, so the card keeps working if the design is withdrawn. */
export async function useCommunityDesign(db: DB, userId: string, designId: string, storage: Storage = storageFromEnv()) {
  if (!uuid.safeParse(designId).success) throw notFound('Design not found');
  const d = await db.query.communityDesigns.findFirst({ where: and(eq(communityDesigns.id, designId), eq(communityDesigns.status, 'approved')) });
  if (!d) throw notFound('Design not found');
  const src = (await db.query.files.findFirst({ where: eq(files.id, d.fileId) }))!;
  const data = await storage.get(src.key);
  if (!data) throw notFound('Design not found');
  const fid = randomUUID(), key = `files/${userId}/${fid}.webp`;
  await storage.put(key, data, 'image/webp');
  await db.insert(files).values({ id: fid, ownerId: userId, kind: 'card-photo', key, mime: 'image/webp', bytes: data.length, width: src.width, height: src.height });
  await db.update(communityDesigns).set({ uses: sql`${communityDesigns.uses} + 1` }).where(eq(communityDesigns.id, d.id));
  return { id: fid, url: fileUrl(fid), width: src.width ?? 1500, height: src.height ?? 2000 };
}

export async function approvedCharities(db: DB) {
  if (cfg('MONEY_FEATURES') !== '1') return [];
  return db.select({ id: partners.id, name: partners.name, country: partners.country }).from(partners).where(and(eq(partners.kind, 'charity'), eq(partners.status, 'approved'))).orderBy(asc(partners.name));
}

/* ---- Admin review ---- */

export async function reviewQueue(db: DB) {
  assertMoney();
  const ps = await db.select({ p: partners, email: users.email }).from(partners).innerJoin(users, eq(users.id, partners.userId)).orderBy(desc(partners.createdAt)).limit(200);
  const prods = await db.select({ p: products, seller: partners.name }).from(products).innerJoin(partners, eq(partners.id, products.partnerId)).where(eq(products.status, 'pending')).orderBy(asc(products.createdAt));
  const ds = await db.select({ d: communityDesigns, by: partners.name }).from(communityDesigns).innerJoin(partners, eq(partners.id, communityDesigns.partnerId)).where(eq(communityDesigns.status, 'pending')).orderBy(asc(communityDesigns.createdAt));
  return {
    partners: ps.map(({ p, email: e }) => ({ ...p, email: e })),
    products: prods.map(({ p, seller }) => ({ ...p, seller, priceText: formatMoney(p.price, p.currency), imageUrl: p.fileId ? fileUrl(p.fileId) : null })),
    designs: ds.map(({ d, by }) => ({ ...d, by, imageUrl: fileUrl(d.fileId) }))
  };
}

export async function review(db: DB, what: 'partner' | 'product' | 'design', id: string, decision: 'approved' | 'rejected' | 'suspended', note: string | null, now = new Date()) {
  assertMoney();
  if (!uuid.safeParse(id).success) throw notFound('Not found');
  if (what === 'partner') {
    const [p] = await db.update(partners).set({ status: decision, reviewNote: note, reviewedAt: now }).where(eq(partners.id, id)).returning();
    if (!p) throw notFound('Not found');
    await notify(db, [p.userId], { title: decision === 'approved' ? `Your ${p.kind} account is approved` : decision === 'suspended' ? `Your ${p.kind} account is suspended` : `Your ${p.kind} application wasn’t approved`, body: note ?? p.name, link: '/partners' });
    return p;
  }
  if (decision === 'suspended') throw badRequest('Use approve or reject');
  const table = what === 'product' ? products : communityDesigns;
  const [r] = await db.update(table).set({ status: decision }).where(eq(table.id, id)).returning();
  if (!r) throw notFound('Not found');
  return r;
}

/* ================= Printed cards ================= */

export const PRINT_PRICE: Record<Currency, number> = { INR: 24900, GBP: 399, USD: 499, EUR: 449, AED: 1900 };
export const PRINT_COUNTRIES = ['IN', 'GB', 'US', 'AE', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT', 'CA', 'AU'];

export async function orderPrints(db: DB, user: { id: string; email: string }, designId: string, raw: unknown) {
  assertMoney();
  if (!uuid.safeParse(designId).success) throw notFound('Card not found');
  const d = await db.query.cardDrafts.findFirst({ where: and(eq(cardDrafts.id, designId), eq(cardDrafts.userId, user.id)) });
  if (!d) throw notFound('Card not found');
  if (!d.frontFileId || !d.insideFileId) throw badRequest('Open the card and tap “Use this card” or “Print-ready PDF” first, so we have the finished pictures');
  const { quantity, address, currency, promoCode } = z.object({ quantity: z.coerce.number().int().min(1).max(50), address: addressSchema, currency: z.enum(CURRENCIES), promoCode: promoCodeInput }).parse(raw);
  if (!PRINT_COUNTRIES.includes(address.country)) throw badRequest('We can’t post printed cards to that country yet');
  const base = PRINT_PRICE[currency] * quantity;
  const { o, amount } = await db.transaction(async (tx) => {
    const q = promoCode ? await applyPromo(tx, { code: promoCode, purpose: 'print', baseAmount: base, currency, userId: user.id }) : null;
    const paid = q ? q.finalAmount : base;
    const [row] = await tx.insert(orders).values({ userId: user.id, kind: 'print', amount: paid, currency, details: JSON.stringify({ designId: d.id, title: `Printed card: ${d.title}${quantity > 1 ? ` × ${quantity}` : ''}`, frontFileId: d.frontFileId, insideFileId: d.insideFileId, quantity, address, ...(q ? { promo: { code: q.code, base, discount: q.discount } } : {}) }) }).returning();
    if (q) await recordRedemption(tx, q, row.id, user.id);
    return { o: row, amount: paid };
  });
  return createPayment(db, { userId: user.id, purpose: 'print', refId: o.id, amount, currency, email: user.email, description: `Printed and posted: ${d.title}${quantity > 1 ? ` × ${quantity}` : ''}`, returnUrl: '/orders?paid=1' });
}

/* ---------------- Promo codes at checkout ---------------- */

/** What a customer would pay with a code, before they press Pay. The order itself recalculates on the server. */
export async function quoteOrder(db: DB, user: { id: string }, raw: unknown) {
  assertPromotions();
  const input = z.object({
    code: z.string().trim().min(1, 'Type a code').max(40),
    purpose: z.enum(['shop', 'print', 'giftcard']),
    productId: uuid.optional(),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
    currency: z.enum(CURRENCIES).optional(),
    value: z.coerce.number().int().positive().optional()
  }).parse(raw);
  let baseAmount: number; let currency: string;
  if (input.purpose === 'shop') {
    if (!input.productId) throw badRequest('Choose a product first');
    const r = (await db.select({ p: products, s: partners }).from(products).innerJoin(partners, eq(partners.id, products.partnerId)).where(eq(products.id, input.productId)))[0];
    if (!r || r.p.status !== 'approved' || !r.p.active || r.s.status !== 'approved') throw notFound('That product isn’t available');
    baseAmount = r.p.price * input.quantity; currency = r.p.currency;
  } else if (input.purpose === 'print') {
    currency = input.currency ?? 'INR';
    baseAmount = PRINT_PRICE[currency as Currency] * input.quantity;
  } else {
    if (!input.value || !input.currency) throw badRequest('Choose a gift card amount first');
    currency = input.currency; baseAmount = input.value;
  }
  const q = await applyPromo(db, { code: input.code, purpose: input.purpose as Purpose, baseAmount, currency, userId: user.id });
  return {
    code: q.code, label: q.label, purpose: PURPOSE_LABEL[input.purpose as Purpose],
    priceText: formatMoney(q.baseAmount, q.currency), discountText: formatMoney(q.discount, q.currency), totalText: formatMoney(q.finalAmount, q.currency),
    discount: q.discount, finalAmount: q.finalAmount, currency: q.currency
  };
}
