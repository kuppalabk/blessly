import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import type { EmailMessage, EmailProvider } from '@/server/providers/email';
import { affiliateCommissions, affiliates, giftCards, orders, payments, products, promoCodes, promoRedemptions } from '@/server/schema';
import { completePayment, refundPayment } from '@/server/services/money';
import { addProduct, applyPartner, buyGiftCard, buyProduct, giftCardCatalogue, quoteOrder, review } from '@/server/services/marketplace';
import { affiliateDashboard, createPromo, decideAffiliate, joinAffiliate, markCommissionsPaid, recordReferral, updatePromo } from '@/server/services/promotions';

class Mail implements EmailProvider { name = 'test'; sent: EmailMessage[] = []; async send(m: EmailMessage) { this.sent.push(m); return { id: null }; } }
const APP = 'https://blessly.test';
const mail = new Mail();
const addr = { name: 'Asha', line1: '12 Lake Road', city: 'Pune', postcode: '411001', country: 'IN' };

beforeEach(async () => { process.env.MONEY_FEATURES = '1'; await resetDb(); });
afterEach(() => { delete process.env.MONEY_FEATURES; });
afterAll(closeDb);

async function admin() {
  const a = await makeUser({ name: 'Ada Admin' });
  return { id: a.id, email: a.email };
}

async function mug(price = 49900, stock = 50) {
  const seller = await makeUser({ name: 'Seller' });
  const p = await applyPartner(db(), seller.id, { kind: 'seller', name: 'Clay & Co', country: 'IN', website: 'https://clay.example.com' });
  await review(db(), 'partner', p.id, 'approved', null);
  const m = await addProduct(db(), seller.id, { title: 'Hand-painted mug', price, currency: 'INR', stock, countries: 'IN' });
  await review(db(), 'product', m.id, 'approved', null);
  return m;
}

async function buyMug(buyer: { id: string; email: string }, productId: string, promoCode?: string) {
  const r = await buyProduct(db(), buyer, { productId, quantity: 1, address: addr, promoCode });
  return r.checkoutUrl;
}

const paid = (url: string, ok = true) => completePayment(db(), url.split('/pay/')[1], ok, { email: mail, appUrl: APP });

async function code(input: Partial<Parameters<typeof createPromo>[2]> & Record<string, unknown> = {}) {
  return createPromo(db(), await admin(), { code: 'DIWALI10', label: 'Diwali offer', kind: 'percent', value: 10, appliesTo: ['shop', 'print', 'giftcard'], ...input });
}

describe('promo codes at checkout', () => {
  it('reduces the amount charged, records the redemption, and leaves the list price alone', async () => {
    const m = await mug();
    await code();
    const buyer = await makeUser();
    const url = await buyMug(buyer, m.id, 'diwali10');

    const [pay] = await db().select().from(payments).where(eq(payments.id, url.split('/pay/')[1]));
    expect(pay.amount).toBe(44910); // 10% off ₹499

    const r = await paid(url);
    expect(r.status).toBe('paid');
    const [o] = await db().select().from(orders).where(eq(orders.userId, buyer.id));
    expect(o.amount).toBe(44910);
    expect(JSON.parse(o.details).promo).toEqual({ code: 'DIWALI10', base: 49900, discount: 4990 });
    expect((await db().select().from(promoRedemptions)).length).toBe(1);
    expect((await db().select().from(products).where(eq(products.id, m.id)))[0].price).toBe(49900);
  });

  it('shows the same price in the checkout preview as the order charges', async () => {
    const m = await mug();
    await code({ code: 'SAVE20', value: 20 });
    const q = await quoteOrder(db(), await makeUser(), { code: 'save20', purpose: 'shop', productId: m.id, quantity: 2 });
    expect(q).toMatchObject({ code: 'SAVE20', discount: 19960, finalAmount: 79840, priceText: '₹998', totalText: '₹798.40' });
  });

  it('refuses codes that are unknown, expired, not yet started, or for another purchase', async () => {
    const m = await mug();
    const buyer = await makeUser();
    await expect(buyMug(buyer, m.id, 'NOPE')).rejects.toThrow(/isn’t valid/);
    await code({ code: 'OLD', endsAt: new Date(Date.now() - 1000) });
    await expect(buyMug(buyer, m.id, 'OLD')).rejects.toThrow(/expired/);
    await code({ code: 'LATER', startsAt: new Date(Date.now() + 86400000) });
    await expect(buyMug(buyer, m.id, 'LATER')).rejects.toThrow(/valid yet/);
    await code({ code: 'GIFTONLY', appliesTo: ['giftcard'] });
    await expect(buyMug(buyer, m.id, 'GIFTONLY')).rejects.toThrow(/doesn’t apply to shop products/);
  });

  it('enforces the minimum spend and the currency of fixed amounts', async () => {
    const m = await mug(49900);
    await code({ code: 'BIGSPEND', kind: 'fixed', value: 500, currency: 'INR', minAmount: 100000 });
    await expect(buyMug(await makeUser(), m.id, 'BIGSPEND')).rejects.toThrow(/at least ₹1,000/);
    await code({ code: 'USDOFF', kind: 'fixed', value: 500, currency: 'USD' });
    await expect(buyMug(await makeUser(), m.id, 'USDOFF')).rejects.toThrow(/works on USD purchases/);
  });

  it('a fixed amount is capped at the price, and a code can never make an order free', async () => {
    const m = await mug(49900);
    await code({ code: 'HUGE', kind: 'fixed', value: 99999999, currency: 'INR' });
    await expect(buyMug(await makeUser(), m.id, 'HUGE')).rejects.toThrow(/can’t make the order free/);
    await code({ code: 'ALLOFIT', value: 100 });
    await expect(buyMug(await makeUser(), m.id, 'ALLOFIT')).rejects.toThrow(/can’t make the order free/);
  });

  it('limits uses per customer and in total, and a failed payment frees the use again', async () => {
    const m = await mug();
    await code({ code: 'TWICE', perUserLimit: 1, maxRedemptions: 2 });
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const first = await buyMug(a, m.id, 'TWICE');
    await expect(buyMug(a, m.id, 'TWICE')).rejects.toThrow(/already used this code/);
    await paid(first, false); // failed payment: does not count
    await buyMug(a, m.id, 'TWICE');
    await buyMug(b, m.id, 'TWICE');
    await expect(buyMug(c, m.id, 'TWICE')).rejects.toThrow(/fully used/);
  });

  it('gift cards keep their face value; only the amount paid goes down', async () => {
    const brand = giftCardCatalogue()[0];
    const value = brand.denominations.INR![0];
    await code({ code: 'GIFT15', value: 15, appliesTo: ['giftcard'] });
    const buyer = await makeUser({ email: 'gifter@example.com' });
    const r = await buyGiftCard(db(), buyer, { brand: brand.id, currency: 'INR', value, recipientName: 'Sam', recipientEmail: 'sam@example.com', promoCode: 'gift15' });
    const [pay] = await db().select().from(payments).where(eq(payments.id, r.checkoutUrl.split('/pay/')[1]));
    expect(pay.amount).toBe(value - Math.floor((value * 15) / 100));
    const [gc] = await db().select().from(giftCards);
    expect(gc.value).toBe(value);
  });
});

describe('affiliate programme', () => {
  it('joins as pending, earns only once approved, and a sale through a referral is recorded and paid out', async () => {
    const m = await mug(100000);
    const aff = await makeUser({ name: 'Priya Partner' });
    const app = await joinAffiliate(db(), { id: aff.id, name: aff.name });
    expect(app.status).toBe('pending');
    const again = await joinAffiliate(db(), { id: aff.id, name: aff.name });
    expect(again.id).toBe(app.id); // one application per person

    // Pending: the partner's code doesn't work yet.
    const buyer = await makeUser();
    await expect(buyMug(buyer, m.id, app.code)).rejects.toThrow(/isn’t valid/);

    await decideAffiliate(db(), await admin(), app.id, { status: 'approved', commissionPercent: 12 });
    await recordReferral(db(), buyer.id, app.code);
    await paid(await buyMug(buyer, m.id));
    const [c] = await db().select().from(affiliateCommissions);
    expect(c).toMatchObject({ amount: 12000, percent: 12, saleAmount: 100000, status: 'pending', currency: 'INR' });

    const dash = await affiliateDashboard(db(), aff.id);
    expect(dash).toMatchObject({ referrals: 1, sales: 1, pending: { INR: 12000 }, paid: {} });

    await expect(markCommissionsPaid(db(), await admin(), app.id, { reference: 'x' })).rejects.toThrow(/bank transfer ID/);
    const pay = await markCommissionsPaid(db(), await admin(), app.id, { reference: 'UPI-REF-778' });
    expect(pay).toEqual({ count: 1, byCurrency: { INR: 12000 } });
    expect((await affiliateDashboard(db(), aff.id))!.paid).toEqual({ INR: 12000 });
    await expect(markCommissionsPaid(db(), await admin(), app.id, { reference: 'AGAIN-1' })).rejects.toThrow(/Nothing is waiting/);
  });

  it('credits the partner whose code was used, even without a referral', async () => {
    const m = await mug(100000);
    const aff = await makeUser();
    const app = await joinAffiliate(db(), { id: aff.id, name: 'Code Partner' });
    await decideAffiliate(db(), await admin(), app.id, { status: 'approved' });
    await paid(await buyMug(await makeUser(), m.id, app.code));
    const [c] = await db().select().from(affiliateCommissions);
    // The customer's code takes 10% off ₹1,000 first, so the partner earns 10% of the ₹900 actually paid.
    expect(c).toMatchObject({ saleAmount: 90000, amount: 9000 });
  });

  it('pausing switches the code off; partners earn nothing on their own purchases', async () => {
    const m = await mug(100000);
    const aff = await makeUser();
    const app = await joinAffiliate(db(), { id: aff.id, name: 'Self Buyer' });
    await decideAffiliate(db(), await admin(), app.id, { status: 'approved' });
    await paid(await buyMug(aff, m.id, app.code)); // own code, own purchase
    expect(await db().select().from(affiliateCommissions)).toHaveLength(0);
    await decideAffiliate(db(), await admin(), app.id, { status: 'paused' });
    await expect(buyMug(await makeUser(), m.id, app.code)).rejects.toThrow(/isn’t valid/);
    expect((await db().select().from(affiliates).where(eq(affiliates.id, app.id)))[0].status).toBe('paused');
  });

  it('a refund cancels the commission that was still pending', async () => {
    const m = await mug(100000);
    const aff = await makeUser();
    const app = await joinAffiliate(db(), { id: aff.id, name: 'Refund Partner' });
    await decideAffiliate(db(), await admin(), app.id, { status: 'approved' });
    const url = await buyMug(await makeUser(), m.id, app.code);
    await paid(url);
    const [p] = await db().select().from(payments).where(eq(payments.id, url.split('/pay/')[1]));
    await refundPayment(db(), p.id);
    const [c] = await db().select().from(affiliateCommissions);
    expect(c.status).toBe('void');
    expect((await affiliateDashboard(db(), aff.id))!.pending).toEqual({});
  });
});

describe('admin controls', () => {
  it('rejects duplicate codes and lets the admin pause a code without changing the terms', async () => {
    const a = await admin();
    const p = await createPromo(db(), a, { code: 'SPRING', label: 'Spring', kind: 'percent', value: 5, appliesTo: ['shop'] });
    await expect(createPromo(db(), a, { code: 'spring', label: 'Again', kind: 'percent', value: 5, appliesTo: ['shop'] })).rejects.toMatchObject({ status: 409 });
    const u = await updatePromo(db(), a, p.id, { active: false });
    expect(u.active).toBe(false);
    expect((await db().select().from(promoCodes).where(eq(promoCodes.id, p.id)))[0].value).toBe(5);
  });

  it('a partner’s code can’t be switched on or off by hand', async () => {
    const aff = await makeUser();
    const app = await joinAffiliate(db(), { id: aff.id, name: 'Manual' });
    const [pc] = await db().select().from(promoCodes).where(eq(promoCodes.code, app.code));
    await expect(updatePromo(db(), await admin(), pc.id, { active: true })).rejects.toThrow(/approval/);
  });
});
