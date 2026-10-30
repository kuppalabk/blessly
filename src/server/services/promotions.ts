import { cfg } from '../settings';
import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { adminAudit, affiliateCommissions, affiliateReferrals, affiliates, orders, promoCodes, promoRedemptions, users } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { notify } from './notify';
import { CURRENCIES, formatMoney } from '@/lib/money';

/** Promotions and affiliates run with the other money features: test mode only, switched on by MONEY_FEATURES=1. */
export function assertPromotions() {
  if (cfg('MONEY_FEATURES') !== '1') throw notFound('Not found');
}

export const PURPOSES = ['shop', 'print', 'giftcard'] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABEL: Record<Purpose, string> = { shop: 'Shop products', print: 'Printed cards', giftcard: 'Gift cards' };

/** Customers' discount for affiliate codes, until the admin changes it on the promo row. */
export const AFFILIATE_CUSTOMER_PERCENT = 10;
/** Orders that no longer count against a code's limits. */
const DEAD_ORDER = ['failed', 'cancelled', 'refunded'];

type Conn = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

export const normaliseCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** The discount in minor units, never more than the price. Percentages round down. */
export function discountFor(p: { kind: string; value: number }, base: number) {
  if (base <= 0) return 0;
  const d = p.kind === 'percent' ? Math.floor((base * p.value) / 100) : p.value;
  return Math.max(0, Math.min(base, d));
}

export type Quote = {
  promoId: string; code: string; label: string; kind: string; value: number;
  baseAmount: number; discount: number; finalAmount: number; currency: string; affiliateId: string | null;
};

/**
 * Checks a code for one purchase and returns the price after the discount. Runs inside the order's transaction
 * (pass the transaction) and locks the code row, so two buyers can't use the last redemption at the same time.
 */
export async function applyPromo(conn: Conn, input: { code: string; purpose: Purpose; baseAmount: number; currency: string; userId: string | null; now?: Date }): Promise<Quote> {
  assertPromotions();
  const now = input.now ?? new Date();
  const code = normaliseCode(input.code);
  const invalid = () => badRequest('That code isn’t valid');
  if (!code) throw invalid();
  const [p] = await conn.select().from(promoCodes).where(eq(promoCodes.code, code)).for('update');
  if (!p || !p.active) throw invalid();
  if (p.startsAt > now) throw badRequest('That code isn’t valid yet');
  if (p.endsAt && p.endsAt <= now) throw badRequest('That code has expired');
  if (!p.appliesTo.split(',').includes(input.purpose)) throw badRequest(`That code doesn’t apply to ${PURPOSE_LABEL[input.purpose].toLowerCase()}`);
  if (p.kind === 'fixed' && p.currency !== input.currency) throw badRequest(`That code works on ${p.currency} purchases`);
  if (input.baseAmount < p.minAmount) throw badRequest(`Purchases of at least ${formatMoney(p.minAmount, input.currency)} get this discount`);

  const [{ n: total }] = await conn.select({ n: count() }).from(promoRedemptions).innerJoin(orders, eq(orders.id, promoRedemptions.orderId))
    .where(and(eq(promoRedemptions.promoId, p.id), notInArray(orders.status, DEAD_ORDER)));
  if (p.maxRedemptions !== null && Number(total) >= p.maxRedemptions) throw badRequest('This code has been fully used');
  if (input.userId) {
    const [{ n: mine }] = await conn.select({ n: count() }).from(promoRedemptions).innerJoin(orders, eq(orders.id, promoRedemptions.orderId))
      .where(and(eq(promoRedemptions.promoId, p.id), eq(promoRedemptions.userId, input.userId), notInArray(orders.status, DEAD_ORDER)));
    if (Number(mine) >= p.perUserLimit) throw badRequest('You’ve already used this code');
  }

  const discount = discountFor(p, input.baseAmount);
  if (discount <= 0) throw badRequest('That code doesn’t reduce this price');
  const finalAmount = input.baseAmount - discount;
  if (finalAmount <= 0) throw badRequest('That code can’t make the order free');
  return { promoId: p.id, code: p.code, label: p.label, kind: p.kind, value: p.value, baseAmount: input.baseAmount, discount, finalAmount, currency: input.currency, affiliateId: p.affiliateId };
}

export async function recordRedemption(conn: Conn, q: Quote, orderId: string, userId: string | null) {
  await conn.insert(promoRedemptions).values({ promoId: q.promoId, userId, orderId, baseAmount: q.baseAmount, discount: q.discount, currency: q.currency });
}

/**
 * Earns the affiliate a commission for a paid order: via the code the buyer used, or else the affiliate who
 * referred the buyer. Affiliates earn only when approved, never on their own purchases, and once per order.
 */
export async function accrueCommission(conn: Conn, o: { orderId: string; userId: string | null; amount: number; currency: string }) {
  const [viaCode] = await conn.select({ affiliateId: promoCodes.affiliateId }).from(promoRedemptions)
    .innerJoin(promoCodes, eq(promoCodes.id, promoRedemptions.promoId)).where(eq(promoRedemptions.orderId, o.orderId));
  let affiliateId = viaCode?.affiliateId ?? null;
  if (!affiliateId && o.userId) {
    const [r] = await conn.select({ affiliateId: affiliateReferrals.affiliateId }).from(affiliateReferrals).where(eq(affiliateReferrals.userId, o.userId));
    affiliateId = r?.affiliateId ?? null;
  }
  if (!affiliateId) return;
  const [a] = await conn.select().from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!a || a.status !== 'approved' || a.userId === o.userId) return;
  const amount = Math.round((o.amount * a.commissionPercent) / 100);
  if (amount <= 0) return;
  await conn.insert(affiliateCommissions).values({ affiliateId: a.id, orderId: o.orderId, saleAmount: o.amount, percent: a.commissionPercent, amount, currency: o.currency }).onConflictDoNothing();
}

/** A refunded order's pending commission is cancelled. Commissions already paid out are left for the admin to handle. */
export async function voidCommission(conn: Conn, orderId: string) {
  await conn.update(affiliateCommissions).set({ status: 'void' }).where(and(eq(affiliateCommissions.orderId, orderId), eq(affiliateCommissions.status, 'pending')));
}

/* ---------------- Affiliates ---------------- */

export async function joinAffiliate(db: DB, user: { id: string; name: string }) {
  assertPromotions();
  const existing = await db.query.affiliates.findFirst({ where: eq(affiliates.userId, user.id) });
  if (existing) return existing;
  const base = (user.name.replace(/[^A-Za-z]/g, '').slice(0, 8) || 'PARTNER').toUpperCase();
  let code = '';
  for (let i = 0; i < 8 && !code; i++) {
    const c = `${base}${randomBytes(2).toString('hex').toUpperCase()}`;
    const taken = (await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, c) })) || (await db.query.affiliates.findFirst({ where: eq(affiliates.code, c) }));
    if (!taken) code = c;
  }
  if (!code) throw new AppError(503, 'busy', 'Please try again in a moment');
  return db.transaction(async (tx) => {
    const [a] = await tx.insert(affiliates).values({ userId: user.id, code, status: 'pending' }).returning();
    // The affiliate's own code: customers get the discount, the affiliate earns on the sale. Off until approval.
    await tx.insert(promoCodes).values({ code, label: `${user.name} — partner offer`, kind: 'percent', value: AFFILIATE_CUSTOMER_PERCENT, appliesTo: 'shop,print,giftcard', active: false, affiliateId: a.id, createdBy: 'affiliate' });
    return a;
  });
}

/** Remembers which affiliate sent a new customer (called at sign-up). Never blocks sign-up. */
export async function recordReferral(db: DB, userId: string, rawCode: string) {
  if (cfg('MONEY_FEATURES') !== '1') return;
  const code = normaliseCode(rawCode);
  const a = await db.query.affiliates.findFirst({ where: and(eq(affiliates.code, code), eq(affiliates.status, 'approved')) });
  if (!a || a.userId === userId) return;
  await db.insert(affiliateReferrals).values({ affiliateId: a.id, userId }).onConflictDoNothing();
}

export async function affiliateDashboard(db: DB, userId: string) {
  assertPromotions();
  const a = await db.query.affiliates.findFirst({ where: eq(affiliates.userId, userId) });
  if (!a) return null;
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.affiliateId, a.id) });
  const [refs] = await db.select({ n: count() }).from(affiliateReferrals).where(eq(affiliateReferrals.affiliateId, a.id));
  const sums = await db.select({ status: affiliateCommissions.status, currency: affiliateCommissions.currency, total: sql<number>`coalesce(sum(${affiliateCommissions.amount}),0)::int`, n: count() })
    .from(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, a.id)).groupBy(affiliateCommissions.status, affiliateCommissions.currency);
  const recent = await db.select().from(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, a.id)).orderBy(desc(affiliateCommissions.createdAt)).limit(20);
  const totals = { pending: {} as Record<string, number>, paid: {} as Record<string, number>, sales: 0 };
  for (const s of sums) {
    if (s.status === 'pending' || s.status === 'paid') totals[s.status][s.currency] = Number(s.total);
    if (s.status !== 'void') totals.sales += Number(s.n);
  }
  return {
    affiliate: a,
    promo: promo ? { code: promo.code, value: promo.value, kind: promo.kind, active: promo.active } : null,
    referrals: Number(refs.n), sales: totals.sales, pending: totals.pending, paid: totals.paid,
    recent: recent.map((c) => ({ id: c.id, amount: c.amount, saleAmount: c.saleAmount, currency: c.currency, status: c.status, percent: c.percent, createdAt: c.createdAt }))
  };
}

const audit = (db: DB, a: { id: string; email: string }, action: string, type: string, id: string, label: string, details: string) =>
  db.insert(adminAudit).values({ adminId: a.id, adminEmail: a.email, action, targetType: type, targetId: id, targetLabel: label, details });

export const affiliateDecisionSchema = z.object({
  status: z.enum(['approved', 'paused', 'rejected']),
  commissionPercent: z.coerce.number().int().min(0).max(50).optional(),
  note: z.string().trim().max(300).optional()
});

export async function decideAffiliate(db: DB, admin: { id: string; email: string }, id: string, raw: unknown, now = new Date()) {
  assertPromotions();
  const input = affiliateDecisionSchema.parse(raw);
  const a = await db.query.affiliates.findFirst({ where: eq(affiliates.id, id) });
  if (!a) throw notFound('Not found');
  await db.transaction(async (tx) => {
    await tx.update(affiliates).set({
      status: input.status,
      commissionPercent: input.commissionPercent ?? a.commissionPercent,
      note: input.note ?? a.note,
      approvedAt: input.status === 'approved' && a.status !== 'approved' ? now : a.approvedAt
    }).where(eq(affiliates.id, id));
    // The partner's code works only while the application is approved.
    await tx.update(promoCodes).set({ active: input.status === 'approved' }).where(eq(promoCodes.affiliateId, id));
    await audit(tx as unknown as DB, admin, 'affiliate.decide', 'affiliate', id, a.code, JSON.stringify({ status: input.status, commissionPercent: input.commissionPercent ?? a.commissionPercent }));
  });
  if (input.status !== a.status) {
    await notify(db, [a.userId], {
      title: input.status === 'approved' ? 'Your partner account is approved' : input.status === 'paused' ? 'Your partner account is paused' : 'Your partner application wasn’t approved',
      body: input.note ?? (input.status === 'approved' ? `Share your link or code ${a.code}.` : ''), link: '/affiliate'
    });
  }
  return { ...a, status: input.status };
}

export const payoutSchema = z.object({ reference: z.string().trim().min(2, 'Add a reference, such as a bank transfer ID').max(80) });

/** Marks every pending commission of an affiliate as paid. Money moves outside the app (test mode records it only). */
export async function markCommissionsPaid(db: DB, admin: { id: string; email: string }, affiliateId: string, raw: unknown, now = new Date()) {
  assertPromotions();
  const { reference } = payoutSchema.parse(raw);
  const a = await db.query.affiliates.findFirst({ where: eq(affiliates.id, affiliateId) });
  if (!a) throw notFound('Not found');
  return db.transaction(async (tx) => {
    const rows = await tx.update(affiliateCommissions).set({ status: 'paid', reference, paidAt: now })
      .where(and(eq(affiliateCommissions.affiliateId, affiliateId), eq(affiliateCommissions.status, 'pending'))).returning();
    if (!rows.length) throw badRequest('Nothing is waiting to be paid');
    const byCurrency: Record<string, number> = {};
    for (const r of rows) byCurrency[r.currency] = (byCurrency[r.currency] ?? 0) + r.amount;
    await audit(tx as unknown as DB, admin, 'affiliate.pay', 'affiliate', affiliateId, a.code, JSON.stringify({ reference, count: rows.length, byCurrency }));
    return { count: rows.length, byCurrency };
  });
}

export async function listAffiliates(db: DB) {
  assertPromotions();
  const rows = await db.select({ a: affiliates, name: users.name, email: users.email }).from(affiliates).innerJoin(users, eq(users.id, affiliates.userId)).orderBy(desc(affiliates.createdAt)).limit(300);
  const sums = await db.select({ affiliateId: affiliateCommissions.affiliateId, status: affiliateCommissions.status, currency: affiliateCommissions.currency, total: sql<number>`coalesce(sum(${affiliateCommissions.amount}),0)::int` })
    .from(affiliateCommissions).groupBy(affiliateCommissions.affiliateId, affiliateCommissions.status, affiliateCommissions.currency);
  return rows.map(({ a, name, email }) => {
    const mine = sums.filter((s) => s.affiliateId === a.id && s.status !== 'void');
    const pending: Record<string, number> = {}; const paid: Record<string, number> = {};
    for (const s of mine) (s.status === 'pending' ? pending : paid)[s.currency] = Number(s.total);
    return { id: a.id, name, email, code: a.code, status: a.status, commissionPercent: a.commissionPercent, createdAt: a.createdAt, pending, paid };
  });
}

/* ---------------- Promo codes (admin) ---------------- */

export const promoInputSchema = z.object({
  code: z.string().transform(normaliseCode).refine((s) => CODE_RE.test(s), 'Use 3–32 letters, numbers, - or _'),
  label: z.string().trim().min(2, 'Give the offer a name customers will recognise').max(80),
  kind: z.enum(['percent', 'fixed']),
  value: z.coerce.number().int().min(1, 'Enter a discount'),
  currency: z.enum(CURRENCIES).optional(),
  appliesTo: z.array(z.enum(PURPOSES)).min(1, 'Choose at least one kind of purchase'),
  minAmount: z.coerce.number().int().min(0).default(0),
  maxRedemptions: z.coerce.number().int().min(1).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(1).max(100).default(1),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional()
}).superRefine((v, ctx) => {
  if (v.kind === 'percent' && (v.value < 1 || v.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is 1 to 100' });
  if (v.kind === 'fixed' && !v.currency) ctx.addIssue({ code: 'custom', path: ['currency'], message: 'Choose the currency for a fixed amount' });
});

export async function createPromo(db: DB, admin: { id: string; email: string }, raw: unknown) {
  assertPromotions();
  const v = promoInputSchema.parse(raw);
  if (await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, v.code) })) throw new AppError(409, 'exists', 'That code already exists');
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(promoCodes).values({
      code: v.code, label: v.label, kind: v.kind, value: v.value, currency: v.kind === 'fixed' ? v.currency! : null, appliesTo: v.appliesTo.join(','),
      minAmount: v.minAmount, maxRedemptions: v.maxRedemptions ?? null, perUserLimit: v.perUserLimit,
      startsAt: v.startsAt ?? new Date(), endsAt: v.endsAt ?? null, createdBy: admin.email
    }).returning();
    await audit(tx as unknown as DB, admin, 'promo.create', 'promo', p.id, p.code, JSON.stringify({ kind: p.kind, value: p.value, appliesTo: p.appliesTo }));
    return p;
  });
}

export const promoUpdateSchema = z.object({
  active: z.boolean().optional(),
  label: z.string().trim().min(2).max(80).optional(),
  maxRedemptions: z.coerce.number().int().min(1).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(1).max(100).optional(),
  endsAt: z.coerce.date().nullable().optional()
});

export async function updatePromo(db: DB, admin: { id: string; email: string }, id: string, raw: unknown) {
  assertPromotions();
  const v = promoUpdateSchema.parse(raw);
  const p = await db.query.promoCodes.findFirst({ where: eq(promoCodes.id, id) });
  if (!p) throw notFound('Not found');
  if (p.affiliateId && v.active !== undefined) throw badRequest('Partner codes switch on and off with the partner’s approval');
  return db.transaction(async (tx) => {
    const [u] = await tx.update(promoCodes).set(v).where(eq(promoCodes.id, id)).returning();
    await audit(tx as unknown as DB, admin, 'promo.update', 'promo', id, p.code, JSON.stringify(Object.keys(v)));
    return u;
  });
}

export async function listPromos(db: DB) {
  assertPromotions();
  return db.select({
    p: promoCodes, partner: users.name,
    used: sql<number>`count(${promoRedemptions.id})::int`,
    saved: sql<number>`coalesce(sum(${promoRedemptions.discount}),0)::int`
  }).from(promoCodes)
    .leftJoin(affiliates, eq(affiliates.id, promoCodes.affiliateId)).leftJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(promoRedemptions, eq(promoRedemptions.promoId, promoCodes.id))
    .groupBy(promoCodes.id, users.name).orderBy(desc(promoCodes.createdAt)).limit(300);
}
