import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import type { EmailMessage, EmailProvider } from '@/server/providers/email';
import type { Storage } from '@/server/providers/storage';
import { cardDrafts, giftCards, orders, products } from '@/server/schema';
import { account, balance, completePayment, decidePayout, moneyJobs, refundPayment, requestPayout } from '@/server/services/money';
import {
  addProduct, applyPartner, buyGiftCard, buyProduct, closeCollection, communityDesignList, contribute, createCollection, myOrders, myPartnerships,
  openGiftCard, orderPrints, organiserView, publicCollection, review, shopProducts, submitDesign, updateSellerOrder, useCommunityDesign
} from '@/server/services/marketplace';
import { createDesign, setRender } from '@/server/services/designs';

class Mail implements EmailProvider { name = 'test'; sent: EmailMessage[] = []; async send(m: EmailMessage) { this.sent.push(m); return { id: null }; } }
class MemoryStorage implements Storage { name = 'memory'; files = new Map<string, Buffer>(); async put(k: string, d: Buffer) { this.files.set(k, d); } async get(k: string) { return this.files.get(k) ?? null; } async delete(k: string) { this.files.delete(k); } }
const APP = 'https://blessly.test';

beforeEach(async () => { process.env.MONEY_FEATURES = '1'; await resetDb(); });
afterEach(() => { delete process.env.MONEY_FEATURES; });
afterAll(closeDb);

const pay = async (url: string, mail: Mail, ok = true, now?: Date) => completePayment(db(), url.split('/pay/')[1], ok, { email: mail, appUrl: APP, now });

describe('money features are off unless switched on', () => {
  it('refuses everything with MONEY_FEATURES unset', async () => {
    delete process.env.MONEY_FEATURES;
    const u = await makeUser();
    await expect(createCollection(db(), u.id, { kind: 'gift', title: 'Pot', currency: 'INR' })).rejects.toMatchObject({ status: 404 });
    expect(await communityDesignList(db())).toEqual([]);
  });
});

describe('group gifts and fundraisers', () => {
  it('friends chip in through the test checkout; the organiser sees it and requests a payout', async () => {
    const org = await makeUser({ name: 'Olu Organiser' });
    const mail = new Mail();
    const pot = await createCollection(db(), org.id, { kind: 'gift', title: 'Leaving gift for Sam', recipientName: 'Sam', currency: 'INR', target: 500000 });
    await expect(contribute(db(), pot.slug, { name: 'Tiny', amount: 500 }, null)).rejects.toThrow(/minimum is ₹10/);
    const a = await contribute(db(), pot.slug, { name: 'Ann', email: 'ann@example.com', amount: 100000, message: 'Good luck!' }, null);
    expect(a.checkoutUrl).toMatch(/^\/pay\/[0-9a-f-]+$/);
    const b = await contribute(db(), pot.slug, { name: 'Ben', amount: 50000, anonymous: true }, null);
    const failed = await contribute(db(), pot.slug, { name: 'Cat', amount: 70000 }, null);
    expect((await pay(a.checkoutUrl, mail)).status).toBe('paid');
    expect((await pay(a.checkoutUrl, mail)).status).toBe('already'); // idempotent
    await pay(b.checkoutUrl, mail);
    await pay(failed.checkoutUrl, mail, false);

    const pub = await publicCollection(db(), pot.slug);
    expect(pub).toMatchObject({ raised: 150000, count: 2 });
    expect(pub.supporters.map((s) => s.name)).toEqual(['Anonymous', 'Ann']);
    expect(mail.sent[0]).toMatchObject({ to: 'ann@example.com', subject: 'Thank you for chipping in — Leaving gift for Sam' });
    expect(mail.sent[0].text).toContain('TEST MODE');

    const v = await organiserView(db(), org.id, pot.id);
    expect(v.balance).toEqual({ INR: 150000 });
    const other = await makeUser();
    await expect(requestPayout(db(), other.id, account.collection(pot.id), 'INR')).rejects.toMatchObject({ status: 404 });
    const po = await requestPayout(db(), org.id, account.collection(pot.id), 'INR');
    expect(po.amount).toBe(150000);
    expect(await balance(db(), account.collection(pot.id))).toEqual({ INR: 0 });
    await expect(requestPayout(db(), org.id, account.collection(pot.id), 'INR')).rejects.toThrow(/nothing/);
    await decidePayout(db(), po.id, false, null);
    expect(await balance(db(), account.collection(pot.id))).toEqual({ INR: 150000 }); // rejected → back in the balance

    // Refund one contribution.
    await refundPayment(db(), b.paymentId);
    expect((await publicCollection(db(), pot.slug)).raised).toBe(100000);
    expect(await balance(db(), account.collection(pot.id))).toEqual({ INR: 100000 });
    await closeCollection(db(), org.id, pot.id);
    await expect(contribute(db(), pot.slug, { name: 'Late', amount: 10000 }, null)).rejects.toThrow(/closed/);
  });

  it('fundraisers go to an approved charity', async () => {
    const charityOwner = await makeUser();
    const org = await makeUser();
    const mail = new Mail();
    await expect(applyPartner(db(), charityOwner.id, { kind: 'charity', name: 'Helping Hands', country: 'IN' })).rejects.toThrow(/registration/);
    const ch = await applyPartner(db(), charityOwner.id, { kind: 'charity', name: 'Helping Hands', country: 'IN', regNumber: '12A/80G-1234' });
    await expect(createCollection(db(), org.id, { kind: 'fundraiser', title: 'Run for water', currency: 'INR', charityId: ch.id })).rejects.toThrow(/verified charity/);
    await review(db(), 'partner', ch.id, 'approved', null);
    const f = await createCollection(db(), org.id, { kind: 'fundraiser', title: 'Run for water', currency: 'INR', charityId: ch.id, target: 1000000 });
    await pay((await contribute(db(), f.slug, { name: 'Dee', amount: 200000 }, null)).checkoutUrl, mail);
    expect(await balance(db(), account.partner(ch.id))).toEqual({ INR: 200000 }); // straight to the charity
    expect(await balance(db(), account.collection(f.id))).toEqual({});
    const mine = await myPartnerships(db(), charityOwner.id);
    expect(mine[0].donations).toEqual([expect.objectContaining({ name: 'Dee', fundraiser: 'Run for water' })]);
    expect((await publicCollection(db(), f.slug)).collection.charity).toMatchObject({ name: 'Helping Hands', regNumber: '12A/80G-1234' });
  });
});

describe('gift cards', () => {
  it('buy, issue (encrypted), deliver now or on a date, open by link', async () => {
    const u = await makeUser({ name: 'Gita Giver' });
    const mail = new Mail();
    await expect(buyGiftCard(db(), u, { brand: 'pageturner', currency: 'INR', value: 12345, recipientName: 'R', recipientEmail: 'r@example.com' })).rejects.toThrow(/amounts shown/);
    const now = new Date();
    const later = await buyGiftCard(db(), u, { brand: 'pageturner', currency: 'INR', value: 100000, recipientName: 'Ravi', recipientEmail: 'ravi@example.com', message: 'Happy reading!', deliverOn: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10) }, now);
    const nowCard = await buyGiftCard(db(), u, { brand: 'bean-and-leaf', currency: 'GBP', value: 2000, recipientName: 'Jo', recipientEmail: 'jo@example.com' }, now);
    await pay(later.checkoutUrl, mail, true, now);
    await pay(nowCard.checkoutUrl, mail, true, now);
    const cards = await db().select().from(giftCards);
    expect(cards.every((c) => c.codeEnc && !c.codeEnc.includes('TEST-'))).toBe(true); // encrypted at rest
    expect(mail.sent.map((m) => m.to)).toEqual(['jo@example.com']);
    expect(mail.sent[0].text).not.toMatch(/TEST-[A-Z]{4}-/); // the code is never emailed
    const token = mail.sent[0].text.match(/\/g\/([\w-]+)/)![1];
    const opened = await openGiftCard(db(), token);
    expect(opened).toMatchObject({ value: '£20', from: 'Gita Giver', brand: { name: 'Bean & Leaf Café' } });
    expect(opened.code).toMatch(/^TEST-BEAN-/);

    expect((await moneyJobs(db(), { email: mail, appUrl: APP }, new Date(now.getTime() + 86400000))).giftCards).toBe(0);
    expect((await moneyJobs(db(), { email: mail, appUrl: APP }, new Date(now.getTime() + 4 * 86400000))).giftCards).toBe(1);
    expect(mail.sent.at(-1)!.to).toBe('ravi@example.com');
    expect((await myOrders(db(), u.id)).map((o) => o.status).sort()).toEqual(['delivered', 'delivered']);
    await expect(openGiftCard(db(), 'x'.repeat(24))).rejects.toMatchObject({ status: 404 });
  });
});

describe('sellers and the shop', () => {
  it('approved sellers list products; buyers pay; the seller is credited minus commission and ships', async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const mail = new Mail();
    const p = await applyPartner(db(), seller.id, { kind: 'seller', name: 'Clay & Co', country: 'IN', website: 'https://clay.example.com' });
    await expect(addProduct(db(), seller.id, { title: 'Mug', price: 49900, currency: 'INR', stock: 2 })).rejects.toMatchObject({ status: 403 });
    await review(db(), 'partner', p.id, 'approved', null);
    const mug = await addProduct(db(), seller.id, { title: 'Hand-painted mug', price: 49900, currency: 'INR', stock: 2, countries: 'IN' });
    expect(await shopProducts(db())).toEqual([]); // waits for review
    await review(db(), 'product', mug.id, 'approved', null);
    expect((await shopProducts(db(), 'IN')).map((x) => x.title)).toEqual(['Hand-painted mug']);
    expect(await shopProducts(db(), 'GB')).toEqual([]);

    const address = { name: 'Asha', line1: '12 MG Road', city: 'Pune', postcode: '411001', country: 'IN' };
    await expect(buyProduct(db(), seller, { productId: mug.id, quantity: 1, address })).rejects.toThrow(/own product/);
    await expect(buyProduct(db(), buyer, { productId: mug.id, quantity: 1, address: { ...address, country: 'GB' } })).rejects.toThrow(/deliver/);
    await expect(buyProduct(db(), buyer, { productId: mug.id, quantity: 3, address })).rejects.toThrow(/Only 2 left/);
    const first = await buyProduct(db(), buyer, { productId: mug.id, quantity: 2, address });
    const second = await buyProduct(db(), buyer, { productId: mug.id, quantity: 1, address });
    await pay(first.checkoutUrl, mail);
    expect((await pay(second.checkoutUrl, mail)).status).toBe('refunded'); // sold out while paying
    expect((await db().query.products.findFirst({ where: eq(products.id, mug.id) }))!.stock).toBe(0);
    expect(await balance(db(), account.partner(p.id))).toEqual({ INR: 89820 }); // 99,800 − 10%
    expect(await balance(db(), account.platform)).toEqual({ INR: 9980 });

    const [mine] = await myPartnerships(db(), seller.id);
    expect(mine.orders).toHaveLength(1);
    await updateSellerOrder(db(), seller.id, mine.orders[0].id, { status: 'shipped', tracking: 'DTDC123' });
    expect((await myOrders(db(), buyer.id)).find((o) => o.tracking)).toMatchObject({ status: 'shipped', tracking: 'DTDC123' });
    await expect(updateSellerOrder(db(), buyer.id, mine.orders[0].id, { status: 'delivered' })).rejects.toMatchObject({ status: 403 });
  });
});

describe('designers and printed cards', () => {
  it('approved designs appear in the editor; printed cards go to the print partner and get tracked', async () => {
    const designer = await makeUser();
    const u = await makeUser();
    const store = new MemoryStorage();
    const mail = new Mail();
    const d = await applyPartner(db(), designer.id, { kind: 'designer', name: 'Studio Rang', country: 'IN' });
    await review(db(), 'partner', d.id, 'approved', null);
    const art = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#f5c' } }).png().toBuffer();
    await expect(submitDesign(db(), designer.id, { title: 'Square', occasion: 'diwali' }, { data: await art(1200, 1200) }, store)).rejects.toThrow(/3:4/);
    const sub = await submitDesign(db(), designer.id, { title: 'Rangoli', occasion: 'diwali' }, { data: await art(1500, 2000) }, store);
    expect(await communityDesignList(db(), 'diwali')).toEqual([]);
    await review(db(), 'design', sub.id, 'approved', null);
    const [listed] = await communityDesignList(db(), 'diwali');
    expect(listed).toMatchObject({ title: 'Rangoli', by: 'Studio Rang' });
    const copy = await useCommunityDesign(db(), u.id, listed.id, store);
    expect(copy.url).toMatch(/^\/api\/files\//);

    // Print and post.
    const card = await createDesign(db(), u.id, { occasion: 'diwali' });
    const address = { name: 'Dadi', line1: '4 Lake View', city: 'Kolkata', postcode: '700001', country: 'IN' };
    await expect(orderPrints(db(), u, card.id, { quantity: 1, address, currency: 'INR' })).rejects.toThrow(/finished pictures/);
    const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#fff' } }).png().toBuffer();
    await setRender(db(), u.id, card.id, 'front', png, store);
    await setRender(db(), u.id, card.id, 'inside', png, store);
    await expect(orderPrints(db(), u, card.id, { quantity: 1, address: { ...address, country: 'ZZ' }, currency: 'INR' })).rejects.toThrow(/post printed cards/);
    const t0 = new Date();
    const o = await orderPrints(db(), u, card.id, { quantity: 3, address, currency: 'INR' });
    await pay(o.checkoutUrl, mail, true, t0);
    const [row] = await db().select().from(orders).where(eq(orders.kind, 'print'));
    expect(row).toMatchObject({ status: 'in_production', amount: 74700 });
    expect(row.providerRef).toMatch(/^test_print_/);
    await moneyJobs(db(), { email: mail, appUrl: APP }, new Date(t0.getTime() + 30 * 3600000));
    expect((await db().query.orders.findFirst({ where: eq(orders.id, row.id) }))!).toMatchObject({ status: 'shipped' });
    await moneyJobs(db(), { email: mail, appUrl: APP }, new Date(t0.getTime() + 100 * 3600000));
    expect((await myOrders(db(), u.id))[0]).toMatchObject({ status: 'delivered' });
    void cardDrafts;
  });
});
