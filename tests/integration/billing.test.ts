import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import {
  businessAllowance, cancelSubscription, completeTestCheckout, entitlements, formatPrice, grantPlan, grantsAccess, handleRazorpayWebhook,
  handleStripeWebhook, listPlans, revenueSummary, startCheckout, updatePlan
} from '@/server/services/billing';
import { acceptInvite, createFamily, createInvite } from '@/server/services/family';
import { createBusiness, createCustomer, updateAutomation } from '@/server/services/business';
import { runJobs } from '@/server/services/jobs';
import { OutboxOnlyProvider } from '@/server/providers/email';
import { RazorpayProvider, StripeProvider, TestProvider, type PaymentProvider } from '@/server/providers/payments';
import { bizMessages, plans, subscriptions, users } from '@/server/schema';

beforeEach(async () => {
  await resetDb();
  // Restore list prices in case a test changed them.
  await db().update(plans).set({ inrMonthly: 9900, inrYearly: 95000, usdMonthly: 300, usdYearly: 2900, maxFamilyMembers: 6 }).where(eq(plans.id, 'family'));
  await db().update(plans).set({ inrMonthly: 99900, inrYearly: 959000, usdMonthly: 1900, usdYearly: 18200, businessMessages: 1000 }).where(eq(plans.id, 'business'));
});
afterEach(() => { delete process.env.BILLING_TEST_MODE; });
afterAll(closeDb);

const APP = 'https://app.test';
const RZP_SECRET = 'rzp-webhook-secret';
const STRIPE_SECRET = 'whsec_test123';
const rzpSign = (body: string) => createHmac('sha256', RZP_SECRET).update(body).digest('hex');
const stripeSign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', STRIPE_SECRET).update(`${t}.${body}`).digest('hex')}`;

describe('plans and prices', () => {
  it('has Free, Family (₹99 / $3) and Business (₹999 / $19) with 20% off yearly', async () => {
    const [free, family, business] = await listPlans(db());
    expect([free.id, family.id, business.id]).toEqual(['free', 'family', 'business']);
    expect(formatPrice(family.inrMonthly, 'INR')).toBe('₹99');
    expect(formatPrice(family.usdMonthly, 'USD')).toBe('$3');
    expect(formatPrice(business.inrMonthly, 'INR')).toBe('₹999');
    expect(formatPrice(business.usdMonthly, 'USD')).toBe('$19');
    expect(family.inrYearly).toBeLessThanOrEqual(family.inrMonthly * 12 * 0.8 + 100);
    expect(free.maxFamilyMembers).toBe(3);
    expect(family.maxFamilyMembers).toBe(6);
    expect(business.businessMessages).toBe(1000);
  });

  it('everyone starts on Free', async () => {
    const u = await makeUser();
    expect((await entitlements(db(), u.id)).plan.id).toBe('free');
  });

  it('access rules: active, grace after a failed payment, and until the end of a cancelled period', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    const base = { currentPeriodEnd: new Date('2026-10-30T00:00:00Z') } as never;
    expect(grantsAccess({ ...(base as object), status: 'active' } as never, now)).toBe(true);
    expect(grantsAccess({ ...(base as object), status: 'past_due' } as never, now)).toBe(true); // within 7-day grace
    expect(grantsAccess({ ...(base as object), status: 'past_due' } as never, new Date('2026-11-08T00:00:00Z'))).toBe(false);
    expect(grantsAccess({ ...(base as object), status: 'cancelled' } as never, now)).toBe(false);
    expect(grantsAccess({ status: 'cancelled', currentPeriodEnd: new Date('2026-11-20') } as never, now)).toBe(true);
    expect(grantsAccess({ status: 'pending', currentPeriodEnd: null } as never, now)).toBe(false);
  });
});

describe('plan limits', () => {
  it('free circles hold 3 people; the owner upgrading to Family raises it to 6', async () => {
    const owner = await makeUser();
    const f = await createFamily(db(), owner.id, { name: 'F' });
    for (let i = 0; i < 2; i++) await acceptInvite(db(), (await makeUser()).id, (await createInvite(db(), owner.id, f.id, {})).token);
    await expect(createInvite(db(), owner.id, f.id, {})).rejects.toMatchObject({ status: 402, code: 'plan_limit' });
    process.env.BILLING_TEST_MODE = '1';
    const { subscriptionId } = await startCheckout(db(), { ...owner, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, new TestProvider(APP));
    await completeTestCheckout(db(), owner.id, subscriptionId, true);
    await expect(createInvite(db(), owner.id, f.id, {})).resolves.toBeTruthy();
  });

  it('businesses get a 14-day trial with 100 messages, then need the Business plan', async () => {
    const owner = await makeUser();
    const b = await createBusiness(db(), owner.id, { name: 'Shop', timezone: 'Asia/Kolkata' });
    expect(await businessAllowance(db(), b)).toEqual({ quota: 100, source: 'trial' });
    const later = new Date(Date.now() + 15 * 86400000);
    expect(await businessAllowance(db(), b, later)).toEqual({ quota: 0, source: 'none' });
    // After the trial nothing is sent, with a clear reason.
    await updateAutomation(db(), b, 'birthday', { enabled: true, channel: 'email', templateId: null, emailSubject: 's', emailBody: 'b', sendHour: 0 });
    const t = new Date(later); const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: 'numeric', day: 'numeric' }).formatToParts(t);
    await createCustomer(db(), b, { name: 'N', email: 'n@example.com', consent: true, birthdayMonth: Number(ist.find((p) => p.type === 'month')!.value), birthdayDay: Number(ist.find((p) => p.type === 'day')!.value) });
    await runJobs(db(), new OutboxOnlyProvider(), later, APP, null);
    expect((await db().select().from(bizMessages))[0]).toMatchObject({ status: 'skipped', error: 'Free trial ended — choose the Business plan to keep sending' });
  });
});

describe('checkout', () => {
  it('uses rupees for India and dollars elsewhere, and refuses when payments aren’t set up', async () => {
    const india = await makeUser({ country: 'IN' });
    const uk = await makeUser({ country: 'GB' });
    const calls: { currency: string; amount: number }[] = [];
    const fake: PaymentProvider = { name: 'test', checkout: async (r) => { calls.push(r); return { url: 'https://pay.test', providerSubscriptionId: 'x' + calls.length }; }, cancelAtPeriodEnd: async () => {}, cancelNow: async () => {} };
    await startCheckout(db(), { ...india, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, fake);
    await startCheckout(db(), { ...uk, country: 'GB' }, { planId: 'business', interval: 'year' }, APP, fake);
    expect(calls.map((c) => [c.currency, c.amount])).toEqual([['INR', 9900], ['USD', 18200]]);
    await expect(startCheckout(db(), { ...uk, country: 'GB' }, { planId: 'family', interval: 'month' }, APP, null)).rejects.toMatchObject({ status: 503 });
    // Pending checkouts give no access.
    expect((await entitlements(db(), india.id)).plan.id).toBe('free');
  });

  it('Razorpay: creates a plan for the price once, then a subscription; signed webhooks activate it once', async () => {
    const u = await makeUser({ country: 'IN' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'plan_ABC' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sub_123', short_url: 'https://rzp.io/i/abc', status: 'created' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sub_456', short_url: 'https://rzp.io/i/def' }), { status: 200 }));
    const rzp = new RazorpayProvider('rzp_test_key', 'secret', fetchMock as unknown as typeof fetch);
    const r = await startCheckout(db(), { ...u, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, rzp);
    expect(r.url).toBe('https://rzp.io/i/abc');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ period: 'monthly', interval: 1, item: { amount: 9900, currency: 'INR' } });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Basic ${Buffer.from('rzp_test_key:secret').toString('base64')}`);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ plan_id: 'plan_ABC', total_count: 120, notes: { subscriptionId: r.subscriptionId } });
    // A second checkout at the same price reuses the Razorpay plan.
    const u2 = await makeUser({ country: 'IN' });
    await startCheckout(db(), { ...u2, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, rzp);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).plan_id).toBe('plan_ABC');

    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    const body = JSON.stringify({ event: 'subscription.activated', created_at: 1, payload: { subscription: { entity: { id: 'sub_123', status: 'active', current_end: end, notes: { subscriptionId: r.subscriptionId } } } } });
    await expect(handleRazorpayWebhook(db(), body, 'bad', 'evt_1', RZP_SECRET)).rejects.toMatchObject({ status: 401 });
    expect(await handleRazorpayWebhook(db(), body, rzpSign(body), 'evt_1', RZP_SECRET)).toEqual({ ok: true });
    expect(await handleRazorpayWebhook(db(), body, rzpSign(body), 'evt_1', RZP_SECRET)).toEqual({ duplicate: true });
    const e = await entitlements(db(), u.id);
    expect(e.plan.id).toBe('family');
    expect(e.subscription?.currentPeriodEnd?.getTime()).toBe(end * 1000);
    expect((await db().query.notifications.findMany({ where: (n, { eq: q }) => q(n.userId, u.id) })).map((n) => n.title)).toContain('Welcome to Blessly Family');

    // A failed renewal → past_due (still has access in the grace period) + a warning.
    const pend = JSON.stringify({ event: 'subscription.pending', created_at: 2, payload: { subscription: { entity: { id: 'sub_123', current_end: end } } } });
    await handleRazorpayWebhook(db(), pend, rzpSign(pend), 'evt_2', RZP_SECRET);
    expect((await entitlements(db(), u.id)).subscription?.status).toBe('past_due');
    expect((await db().query.notifications.findMany({ where: (n, { eq: q }) => q(n.userId, u.id) })).map((n) => n.title)).toContain('Your payment didn’t go through');
    // Cancelled: access until the end of the period.
    const canc = JSON.stringify({ event: 'subscription.cancelled', created_at: 3, payload: { subscription: { entity: { id: 'sub_123', current_end: end } } } });
    await handleRazorpayWebhook(db(), canc, rzpSign(canc), 'evt_3', RZP_SECRET);
    expect((await entitlements(db(), u.id)).plan.id).toBe('family');
    expect((await entitlements(db(), u.id, new Date((end + 60) * 1000))).plan.id).toBe('free');
  });

  it('Stripe: checkout session in USD; signed webhooks set the period; old signatures are rejected', async () => {
    const u = await makeUser({ country: 'US' });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }), { status: 200 }));
    const stripe = new StripeProvider('sk_test_x', fetchMock as unknown as typeof fetch);
    const r = await startCheckout(db(), { ...u, country: 'US' }, { planId: 'business', interval: 'month' }, APP, stripe);
    expect(r.url).toMatch(/checkout\.stripe\.com/);
    const sent = new URLSearchParams(fetchMock.mock.calls[0][1].body.toString());
    expect(Object.fromEntries(sent)).toMatchObject({ mode: 'subscription', client_reference_id: r.subscriptionId, 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': '1900', 'line_items[0][price_data][recurring][interval]': 'month' });
    expect(fetchMock.mock.calls[0][1].headers['idempotency-key']).toBe(`checkout-${r.subscriptionId}`);

    const done = JSON.stringify({ id: 'evt_a', type: 'checkout.session.completed', data: { object: { client_reference_id: r.subscriptionId, subscription: 'sub_S1', customer: 'cus_1' } } });
    await expect(handleStripeWebhook(db(), done, stripeSign(done, Math.floor(Date.now() / 1000) - 600), STRIPE_SECRET)).rejects.toMatchObject({ status: 401 });
    await handleStripeWebhook(db(), done, stripeSign(done), STRIPE_SECRET);
    const end = Math.floor(Date.now() / 1000) + 31 * 86400;
    const upd = JSON.stringify({ id: 'evt_b', type: 'customer.subscription.updated', data: { object: { id: 'sub_S1', status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_end: end }] } } } });
    await handleStripeWebhook(db(), upd, stripeSign(upd), STRIPE_SECRET);
    const e = await entitlements(db(), u.id);
    expect(e.plan.id).toBe('business');
    expect(e.subscription).toMatchObject({ providerSubscriptionId: 'sub_S1', providerCustomerId: 'cus_1' });
    expect(e.subscription?.currentPeriodEnd?.getTime()).toBe(end * 1000);
    const del = JSON.stringify({ id: 'evt_c', type: 'customer.subscription.deleted', data: { object: { id: 'sub_S1', status: 'canceled' } } });
    await handleStripeWebhook(db(), del, stripeSign(del), STRIPE_SECRET);
    expect((await entitlements(db(), u.id)).plan.id).toBe('free');
  });

  it('upgrading from Family to Business ends the Family plan; cancelling keeps access to the period end', async () => {
    process.env.BILLING_TEST_MODE = '1';
    const u = await makeUser();
    const t = new TestProvider(APP);
    const a = await startCheckout(db(), { ...u, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, t);
    await completeTestCheckout(db(), u.id, a.subscriptionId, true);
    await expect(startCheckout(db(), { ...u, country: 'IN' }, { planId: 'family', interval: 'month' }, APP, t)).rejects.toThrow(/already on the Family/);
    const b = await startCheckout(db(), { ...u, country: 'IN' }, { planId: 'business', interval: 'year' }, APP, t);
    await completeTestCheckout(db(), u.id, b.subscriptionId, true);
    const rows = await db().select().from(subscriptions).where(eq(subscriptions.userId, u.id));
    expect(Object.fromEntries(rows.map((r) => [r.planId, r.status]))).toEqual({ family: 'replaced', business: 'active' });
    const cancelled = await cancelSubscription(db(), u.id, t);
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect((await entitlements(db(), u.id)).plan.id).toBe('business');
  });
});

describe('admin billing tools', () => {
  it('changes prices for new checkouts, grants plans, and reports revenue', async () => {
    const admin = await makeUser();
    await db().update(users).set({ role: 'admin' }).where(eq(users.id, admin.id));
    const a = { id: admin.id, email: admin.email };
    const fam = (await listPlans(db()))[1];
    await updatePlan(db(), a, 'family', { ...fam, inrMonthly: 14900 });
    expect((await listPlans(db()))[1].inrMonthly).toBe(14900);
    await expect(updatePlan(db(), a, 'free', { ...(await listPlans(db()))[0], inrMonthly: 100 })).rejects.toThrow(/free plan/);
    const u = await makeUser();
    await expect(grantPlan(db(), a, u.id, { planId: 'business', until: '2020-01-01', note: 'partner' })).rejects.toThrow(/future/);
    await grantPlan(db(), a, u.id, { planId: 'business', until: '2099-01-01', note: 'Launch partner' });
    expect((await entitlements(db(), u.id)).plan.id).toBe('business');
    process.env.BILLING_TEST_MODE = '1';
    const payer = await makeUser();
    const s = await startCheckout(db(), { ...payer, country: 'IN' }, { planId: 'family', interval: 'year' }, APP, new TestProvider(APP));
    await completeTestCheckout(db(), payer.id, s.subscriptionId, true);
    const rev = await revenueSummary(db());
    expect(rev).toMatchObject({ paying: 1, byPlan: { family: 1, business: 0 } }); // manual grants aren't revenue
    expect(rev.monthly.INR).toBe(Math.round(95000 / 12));
  });

  it('the test checkout is unavailable unless test mode is on', async () => {
    const u = await makeUser();
    await expect(completeTestCheckout(db(), u.id, '00000000-0000-0000-0000-000000000000', true)).rejects.toMatchObject({ status: 404 });
  });
});
