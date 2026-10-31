import { cfg } from '../settings';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { adminAudit, billingEvents, businesses, notifications, plans, providerPrices, subscriptions, users } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { providerByName, providerFor, RazorpayProvider, StripeProvider, type PaymentProvider } from '../providers/payments';

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export const PLAN_IDS = ['free', 'family', 'business'] as const;
/** After a failed renewal, access continues this long while the provider retries the payment. */
const GRACE_MS = 7 * 86400000;
export const TRIAL_DAYS = 14;
export const TRIAL_MESSAGES = 100;

/** 402 with a code the UI turns into an "Upgrade" link. */
export const planLimit = (msg: string) => new AppError(402, 'plan_limit', msg);

export async function listPlans(db: DB) {
  const rows = await db.select().from(plans);
  return PLAN_IDS.map((id) => rows.find((p) => p.id === id)!).filter(Boolean);
}

/** A subscription gives access while active, during the grace period after a failed payment, and until the end of a cancelled period. */
export function grantsAccess(s: Subscription, now: Date) {
  const end = s.currentPeriodEnd?.getTime() ?? null;
  if (s.status === 'active') return end === null || end + GRACE_MS > now.getTime();
  if (s.status === 'past_due') return end !== null && end + GRACE_MS > now.getTime();
  if (s.status === 'cancelled') return end !== null && end > now.getTime();
  return false;
}

export type Entitlements = { plan: Plan; subscription: Subscription | null };

export async function entitlements(db: DB, userId: string, now = new Date()): Promise<Entitlements> {
  const subs = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['active', 'past_due', 'cancelled'])))
    .orderBy(desc(subscriptions.createdAt));
  const all = await listPlans(db);
  const rank = (id: string) => PLAN_IDS.indexOf(id as (typeof PLAN_IDS)[number]);
  const live = subs.filter((s) => grantsAccess(s, now)).sort((a, b) => rank(b.planId) - rank(a.planId));
  const sub = live[0] ?? null;
  return { plan: all.find((p) => p.id === (sub?.planId ?? 'free'))!, subscription: sub };
}

/** The monthly business allowance: admin override, else the owner's plan, else the free trial, else nothing. */
export async function businessAllowance(db: DB, b: typeof businesses.$inferSelect, now = new Date()) {
  if (b.monthlyQuota !== null) return { quota: b.monthlyQuota, source: 'custom' as const };
  const ent = await entitlements(db, b.ownerId, now);
  if (ent.plan.businessMessages > 0) return { quota: ent.plan.businessMessages, source: 'plan' as const };
  if (b.trialEndsAt && b.trialEndsAt > now) return { quota: TRIAL_MESSAGES, source: 'trial' as const };
  return { quota: 0, source: 'none' as const };
}

export async function businessSeats(db: DB, b: typeof businesses.$inferSelect, now = new Date()) {
  const ent = await entitlements(db, b.ownerId, now);
  if (ent.plan.businessSeats > 0) return ent.plan.businessSeats;
  return b.trialEndsAt && b.trialEndsAt > now ? 3 : 1;
}

/* ---------------- Checkout ---------------- */

export const checkoutSchema = z.object({
  planId: z.enum(['family', 'business']),
  interval: z.enum(['month', 'year']),
  currency: z.enum(['INR', 'USD']).optional()
});

export function priceOf(p: Plan, interval: 'month' | 'year', currency: 'INR' | 'USD') {
  return currency === 'INR' ? (interval === 'month' ? p.inrMonthly : p.inrYearly) : (interval === 'month' ? p.usdMonthly : p.usdYearly);
}

export function formatPrice(amount: number, currency: 'INR' | 'USD') {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
}

/** Creates a pending subscription and returns the provider's payment page. Paid access starts when the provider confirms by webhook. */
export async function startCheckout(db: DB, user: { id: string; email: string; country: string }, raw: unknown, appUrl: string, provider?: PaymentProvider | null) {
  const input = checkoutSchema.parse(raw);
  const currency = input.currency ?? (user.country === 'IN' ? 'INR' : 'USD');
  const p = (await listPlans(db)).find((x) => x.id === input.planId)!;
  const amount = priceOf(p, input.interval, currency);
  if (amount <= 0) throw badRequest('This plan isn’t on sale in that currency');
  const ent = await entitlements(db, user.id);
  if (ent.subscription && ent.plan.id === p.id && ent.subscription.status === 'active' && !ent.subscription.cancelAtPeriodEnd) throw badRequest(`You’re already on the ${p.name} plan`);
  const pay = provider === undefined ? providerFor(currency, appUrl) : provider;
  if (!pay) throw new AppError(503, 'billing_off', currency === 'INR' ? 'Payments in rupees aren’t set up yet' : 'Card payments aren’t set up yet');
  const [row] = await db.insert(subscriptions).values({ userId: user.id, planId: p.id, interval: input.interval, currency, amount, provider: pay.name }).returning();
  const cached = await db.query.providerPrices.findFirst({ where: and(eq(providerPrices.provider, pay.name), eq(providerPrices.planId, p.id), eq(providerPrices.interval, input.interval), eq(providerPrices.currency, currency), eq(providerPrices.amount, amount)) });
  try {
    const r = await pay.checkout({
      subscriptionId: row.id, userId: user.id, email: user.email, planId: p.id, planName: p.name, interval: input.interval, currency, amount,
      successUrl: `${appUrl}/plans?paid=1`, cancelUrl: `${appUrl}/plans?cancelled=1`, providerPriceId: cached?.providerPriceId ?? null
    });
    if (r.providerPriceId && !cached) await db.insert(providerPrices).values({ provider: pay.name, planId: p.id, interval: input.interval, currency, amount, providerPriceId: r.providerPriceId }).onConflictDoNothing();
    if (r.providerSubscriptionId) await db.update(subscriptions).set({ providerSubscriptionId: r.providerSubscriptionId }).where(eq(subscriptions.id, row.id));
    return { url: r.url, subscriptionId: row.id };
  } catch (e) {
    await db.update(subscriptions).set({ status: 'failed', note: (e as Error).message.slice(0, 300) }).where(eq(subscriptions.id, row.id));
    throw new AppError(502, 'provider_error', 'The payment page couldn’t be opened. Please try again in a minute.');
  }
}

/** Cancels at the end of the paid period (the plan keeps working until then). */
export async function cancelSubscription(db: DB, userId: string, provider?: PaymentProvider | null) {
  const { subscription: s } = await entitlements(db, userId);
  if (!s || s.provider === 'manual') throw badRequest('There’s no paid plan to cancel');
  if (s.cancelAtPeriodEnd || s.status === 'cancelled') return s;
  const pay = provider === undefined ? providerByName(s.provider) : provider;
  if (pay && s.providerSubscriptionId) await pay.cancelAtPeriodEnd(s.providerSubscriptionId);
  const [u] = await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscriptions.id, s.id)).returning();
  return u;
}

/* ---------------- Webhooks ---------------- */

async function once(db: DB, provider: string, eventId: string, type: string, raw: string) {
  const [row] = await db.insert(billingEvents).values({ provider, eventId, type, payload: raw.slice(0, 100_000) }).onConflictDoNothing().returning();
  return !!row;
}

/** Applies a status change to our subscription row; on first activation, ends any older plan and tells the user. */
async function applyStatus(db: DB, s: Subscription, patch: { status: string; currentPeriodEnd?: Date | null; cancelAtPeriodEnd?: boolean; providerSubscriptionId?: string; providerCustomerId?: string }, now: Date) {
  const wasActive = s.status === 'active';
  const [u] = await db.update(subscriptions).set({ ...patch, updatedAt: now }).where(eq(subscriptions.id, s.id)).returning();
  if (!wasActive && u.status === 'active') {
    // Upgrading or switching: the previous paid plan ends now.
    const older = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, u.userId), ne(subscriptions.id, u.id), inArray(subscriptions.status, ['active', 'past_due'])));
    for (const o of older) {
      if (o.provider !== 'manual' && o.providerSubscriptionId) await providerByName(o.provider)?.cancelNow(o.providerSubscriptionId).catch(() => undefined);
      await db.update(subscriptions).set({ status: 'replaced', updatedAt: now }).where(eq(subscriptions.id, o.id));
    }
    const p = (await listPlans(db)).find((x) => x.id === u.planId)!;
    await db.insert(notifications).values({ userId: u.userId, title: `Welcome to Blessly ${p.name}`, body: 'Your plan is active. Thank you for supporting Blessly!', link: '/plans' });
  }
  if (s.status === 'active' && u.status === 'past_due') {
    await db.insert(notifications).values({ userId: u.userId, title: 'Your payment didn’t go through', body: 'We’ll try again over the next few days. Please check your payment method so your plan keeps working.', link: '/plans' });
  }
  return u;
}

type RzpSub = { id: string; status?: string; current_end?: number | null; notes?: { subscriptionId?: string } };

/** Razorpay webhook. Events: subscription.authenticated/activated/charged/pending/halted/cancelled/completed. */
export async function handleRazorpayWebhook(db: DB, raw: string, signature: string | null, eventId: string | null, secret: string, now = new Date()) {
  if (!RazorpayProvider.verify(raw, signature, secret)) throw new AppError(401, 'bad_signature', 'Bad signature');
  const evt = JSON.parse(raw) as { event: string; created_at?: number; payload?: { subscription?: { entity?: RzpSub } } };
  const sub = evt.payload?.subscription?.entity;
  if (!(await once(db, 'razorpay', eventId ?? `${evt.event}:${sub?.id}:${evt.created_at}`, evt.event, raw))) return { duplicate: true };
  if (!sub?.id) return { ignored: true };
  const s = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, 'razorpay'), eq(subscriptions.providerSubscriptionId, sub.id)) })
    ?? (sub.notes?.subscriptionId && z.string().uuid().safeParse(sub.notes.subscriptionId).success ? await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, sub.notes.subscriptionId) }) : undefined);
  if (!s) return { ignored: true };
  const end = sub.current_end ? new Date(sub.current_end * 1000) : s.currentPeriodEnd;
  const map: Record<string, string> = {
    'subscription.activated': 'active', 'subscription.charged': 'active', 'subscription.resumed': 'active',
    'subscription.pending': 'past_due', 'subscription.halted': 'past_due',
    'subscription.cancelled': 'cancelled', 'subscription.completed': 'expired', 'subscription.expired': 'expired'
  };
  const status = map[evt.event];
  if (!status) return { ignored: true };
  await applyStatus(db, s, { status, currentPeriodEnd: end, providerSubscriptionId: sub.id, ...(status === 'cancelled' ? { cancelAtPeriodEnd: true } : {}) }, now);
  return { ok: true };
}

type StripeSub = { id: string; status: string; customer?: string; cancel_at_period_end?: boolean; current_period_end?: number; items?: { data?: { current_period_end?: number }[] }; metadata?: { subscriptionId?: string } };

/** Stripe webhook. Events: checkout.session.completed, customer.subscription.created/updated/deleted. */
export async function handleStripeWebhook(db: DB, raw: string, sigHeader: string | null, secret: string, now = new Date()) {
  if (!StripeProvider.verify(raw, sigHeader, secret, now.getTime())) throw new AppError(401, 'bad_signature', 'Bad signature');
  const evt = JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, unknown> } };
  if (!(await once(db, 'stripe', evt.id, evt.type, raw))) return { duplicate: true };
  const o = evt.data.object;
  const byId = async (id: unknown) => (typeof id === 'string' && z.string().uuid().safeParse(id).success ? db.query.subscriptions.findFirst({ where: eq(subscriptions.id, id) }) : undefined);
  if (evt.type === 'checkout.session.completed') {
    const s = await byId(o.client_reference_id);
    if (!s || typeof o.subscription !== 'string') return { ignored: true };
    await applyStatus(db, s, { status: 'active', providerSubscriptionId: o.subscription, providerCustomerId: typeof o.customer === 'string' ? o.customer : undefined }, now);
    return { ok: true };
  }
  if (evt.type.startsWith('customer.subscription.')) {
    const ss = o as unknown as StripeSub;
    const s = (await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.provider, 'stripe'), eq(subscriptions.providerSubscriptionId, ss.id)) })) ?? (await byId(ss.metadata?.subscriptionId));
    if (!s) return { ignored: true };
    const endUnix = ss.current_period_end ?? ss.items?.data?.[0]?.current_period_end;
    const status = evt.type === 'customer.subscription.deleted' || ss.status === 'canceled' ? 'expired'
      : ss.status === 'active' || ss.status === 'trialing' ? 'active'
      : ss.status === 'past_due' || ss.status === 'unpaid' ? 'past_due' : s.status;
    await applyStatus(db, s, { status, currentPeriodEnd: endUnix ? new Date(endUnix * 1000) : s.currentPeriodEnd, cancelAtPeriodEnd: !!ss.cancel_at_period_end, providerSubscriptionId: ss.id }, now);
    return { ok: true };
  }
  return { ignored: true };
}

/** Test provider only (BILLING_TEST_MODE): the fake checkout page confirms or fails a payment. */
export async function completeTestCheckout(db: DB, userId: string, subscriptionId: string, success: boolean, now = new Date()) {
  if (cfg('BILLING_TEST_MODE') !== '1') throw notFound('Not found');
  const s = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId), eq(subscriptions.provider, 'test')) });
  if (!s) throw notFound('Checkout not found');
  if (!success) { await db.update(subscriptions).set({ status: 'failed', updatedAt: now }).where(eq(subscriptions.id, s.id)); return; }
  const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + (s.interval === 'year' ? 12 : 1));
  await applyStatus(db, s, { status: 'active', currentPeriodEnd: end }, now);
}

/* ---------------- Admin ---------------- */

type Admin = { id: string; email: string };
const audit = (db: DB, a: Admin, action: string, type: string, id: string, label: string, details: string) =>
  db.insert(adminAudit).values({ adminId: a.id, adminEmail: a.email, action, targetType: type, targetId: id, targetLabel: label, details });

export const planUpdateSchema = z.object({
  inrMonthly: z.coerce.number().int().min(0).max(100_000_00), inrYearly: z.coerce.number().int().min(0).max(1_000_000_00),
  usdMonthly: z.coerce.number().int().min(0).max(10_000_00), usdYearly: z.coerce.number().int().min(0).max(100_000_00),
  maxFamilyMembers: z.coerce.number().int().min(2).max(50), maxAlbums: z.coerce.number().int().min(0).max(10000),
  maxPhotosPerAlbum: z.coerce.number().int().min(1).max(5000), businessMessages: z.coerce.number().int().min(0).max(10_000_000),
  businessSeats: z.coerce.number().int().min(0).max(100)
});

/** New prices apply to new checkouts; existing subscribers keep the price they signed up at. */
export async function updatePlan(db: DB, admin: Admin, planId: string, raw: unknown) {
  if (!PLAN_IDS.includes(planId as 'free')) throw notFound('Plan not found');
  const input = planUpdateSchema.parse(raw);
  if (planId === 'free' && (input.inrMonthly || input.usdMonthly || input.inrYearly || input.usdYearly)) throw badRequest('The free plan can’t have a price');
  const before = (await listPlans(db)).find((p) => p.id === planId)!;
  const [p] = await db.update(plans).set({ ...input, updatedAt: new Date() }).where(eq(plans.id, planId)).returning();
  const changes = Object.entries(input).filter(([k, v]) => before[k as keyof Plan] !== v).map(([k, v]) => `${k}: ${before[k as keyof Plan]} → ${v}`).join(', ');
  await audit(db, admin, 'plan.update', 'plan', planId, p.name, changes || 'no changes');
  return p;
}

export const grantSchema = z.object({ planId: z.enum(['family', 'business']), until: z.coerce.date(), note: z.string().trim().min(3, 'Add a note (kept in the audit log)').max(200) });

/** Gives a plan without payment (support, partners, testing). */
export async function grantPlan(db: DB, admin: Admin, userId: string, raw: unknown, now = new Date()) {
  const input = grantSchema.parse(raw);
  if (input.until <= now) throw badRequest('Pick a date in the future');
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw notFound('User not found');
  const [s] = await db.insert(subscriptions).values({ userId, planId: input.planId, interval: 'month', currency: 'INR', amount: 0, provider: 'manual', status: 'pending', note: input.note }).returning();
  await applyStatus(db, s, { status: 'active', currentPeriodEnd: input.until }, now);
  await audit(db, admin, 'plan.grant', 'user', userId, u.email, `${input.planId} until ${input.until.toISOString().slice(0, 10)} — ${input.note}`);
}

export async function revokeGrant(db: DB, admin: Admin, subscriptionId: string) {
  const s = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.provider, 'manual')) });
  if (!s) throw notFound('Grant not found');
  await db.update(subscriptions).set({ status: 'expired', updatedAt: new Date() }).where(eq(subscriptions.id, s.id));
  const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
  await audit(db, admin, 'plan.revoke', 'user', s.userId, u?.email ?? s.userId, `${s.planId} grant ended`);
}

export async function subscriptionsFor(db: DB, userId: string) {
  return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(20);
}

export async function revenueSummary(db: DB, now = new Date()) {
  const active = (await db.select().from(subscriptions).where(inArray(subscriptions.status, ['active', 'past_due', 'cancelled']))).filter((s) => grantsAccess(s, now) && s.provider !== 'manual');
  const monthly = { INR: 0, USD: 0 };
  for (const s of active) monthly[s.currency as 'INR' | 'USD'] += s.interval === 'year' ? Math.round(s.amount / 12) : s.amount;
  const byPlan = { family: active.filter((s) => s.planId === 'family').length, business: active.filter((s) => s.planId === 'business').length };
  return { paying: active.length, monthly, byPlan, pastDue: active.filter((s) => s.status === 'past_due').length };
}
