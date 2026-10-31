import { cfg } from '../settings';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { collections, contributions, giftCards, ledgerEntries, orders, partners, payments, payouts, products, users } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { encrypt } from '../crypto';
import { sendEmail, type EmailProvider } from '../providers/email';
import { fileUrl } from '../providers/storage';
import { giftCardProviderFromEnv, printProviderFromEnv, type GiftCardProvider, type PrintAddress, type PrintProvider } from '../providers/fulfilment';
import { notify } from './notify';
import { accrueCommission, voidCommission } from './promotions';
import { brand } from '@/lib/giftcards';
import { formatMoney, SHOP_COMMISSION_BP } from '@/lib/money';

/**
 * Money features run in TEST MODE only: payments go through a fake checkout and no real money moves.
 * They are off unless MONEY_FEATURES=1. Taking real payments needs a payment provider integration for one-off
 * payments, plus the legal, KYC and licensing work described in docs/LAUNCH.md.
 */
export const moneyEnabled = () => cfg('MONEY_FEATURES') === '1';
export function assertMoney() { if (!moneyEnabled()) throw new AppError(404, 'not_found', 'Not found'); }

export type Payment = typeof payments.$inferSelect;
export type Purpose = 'contribution' | 'giftcard' | 'shop' | 'print';
export const account = { collection: (id: string) => `collection:${id}`, partner: (id: string) => `partner:${id}`, platform: 'platform' };

export async function createPayment(db: DB, p: { userId: string | null; purpose: Purpose; refId: string; amount: number; currency: string; email: string | null; description: string; returnUrl: string }) {
  assertMoney();
  const [row] = await db.insert(payments).values({ ...p, provider: 'test', providerRef: `test_${randomBytes(8).toString('hex')}` }).returning();
  return { paymentId: row.id, checkoutUrl: `/pay/${row.id}` };
}

export async function getPayment(db: DB, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Payment not found');
  const p = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!p) throw notFound('Payment not found');
  return p;
}

type Ctx = { email: EmailProvider; appUrl: string; giftcards?: GiftCardProvider; printer?: PrintProvider; now?: Date };

/**
 * The test checkout's result (a real provider's webhook would call this too). Idempotent:
 * only a pending payment changes, and fulfilment runs once.
 */
export async function completePayment(db: DB, id: string, success: boolean, ctx: Ctx) {
  assertMoney();
  const now = ctx.now ?? new Date();
  const p = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(payments).where(eq(payments.id, id)).for('update');
    if (!row) throw notFound('Payment not found');
    if (row.status !== 'pending') return null;
    const [u] = await tx.update(payments).set(success ? { status: 'paid', paidAt: now } : { status: 'failed' }).where(eq(payments.id, id)).returning();
    if (!success) {
      if (u.purpose !== 'contribution') await tx.update(orders).set({ status: 'failed', updatedAt: now }).where(eq(orders.id, u.refId));
      return null;
    }
    // Money in: record who it belongs to.
    if (u.purpose === 'contribution') {
      const [c] = await tx.update(contributions).set({ status: 'paid', paidAt: now }).where(eq(contributions.id, u.refId)).returning();
      const col = (await tx.query.collections.findFirst({ where: eq(collections.id, c.collectionId) }))!;
      await tx.insert(ledgerEntries).values({ account: col.charityId ? account.partner(col.charityId) : account.collection(col.id), paymentId: u.id, amount: u.amount, currency: u.currency, kind: 'credit', note: `${c.anonymous ? 'Anonymous' : c.name} → ${col.title}` });
    } else if (u.purpose === 'shop') {
      const [o] = await tx.select().from(orders).where(eq(orders.id, u.refId)).for('update');
      const d = JSON.parse(o.details) as { productId: string; quantity: number };
      const [pr] = await tx.select().from(products).where(eq(products.id, d.productId)).for('update');
      if (!pr || pr.stock < d.quantity) {
        // Sold out while paying: refund straight away.
        await tx.update(payments).set({ status: 'refunded', refundedAt: now }).where(eq(payments.id, u.id));
        await tx.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, o.id));
        return { ...u, soldOut: true };
      }
      await tx.update(products).set({ stock: pr.stock - d.quantity }).where(eq(products.id, pr.id));
      await tx.update(orders).set({ status: 'paid', updatedAt: now }).where(eq(orders.id, o.id));
      const fee = Math.round((u.amount * SHOP_COMMISSION_BP) / 10000);
      await tx.insert(ledgerEntries).values([
        { account: account.partner(o.partnerId!), paymentId: u.id, amount: u.amount - fee, currency: u.currency, kind: 'credit', note: `Order ${o.id.slice(0, 8)}` },
        { account: account.platform, paymentId: u.id, amount: fee, currency: u.currency, kind: 'fee', note: `Commission on order ${o.id.slice(0, 8)}` }
      ]);
    } else {
      await tx.update(orders).set({ status: 'paid', updatedAt: now }).where(eq(orders.id, u.refId));
      await tx.insert(ledgerEntries).values({ account: account.platform, paymentId: u.id, amount: u.amount, currency: u.currency, kind: 'credit', note: `${u.purpose} order ${u.refId.slice(0, 8)}` });
    }
    // Affiliates earn on what the customer actually paid (after any promo code).
    await accrueCommission(tx, { orderId: u.refId, userId: u.userId, amount: u.amount, currency: u.currency });
    return u;
  });
  if (!p) return { status: success ? 'already' : 'failed' };
  if ('soldOut' in p) return { status: 'refunded' };
  await fulfil(db, p, ctx, now);
  return { status: 'paid' };
}

/** After payment: tell people, issue gift cards, send prints. Failures here are retried by the job runner. */
async function fulfil(db: DB, p: Payment, ctx: Ctx, now: Date) {
  if (p.purpose === 'contribution') {
    const c = (await db.query.contributions.findFirst({ where: eq(contributions.id, p.refId) }))!;
    const col = (await db.query.collections.findFirst({ where: eq(collections.id, c.collectionId) }))!;
    await notify(db, [col.userId], { title: `${c.anonymous ? 'Someone' : c.name} chipped in ${formatMoney(c.amount, c.currency)}`, body: col.title, link: `/pots/${col.id}` });
    if (c.email) await sendEmail(db, ctx.email, { to: c.email, subject: `Thank you for chipping in — ${col.title}`, text: `Hi ${c.name},\n\nYour contribution of ${formatMoney(c.amount, c.currency)} to “${col.title}” has been received.\n\n(TEST MODE — no real money was taken.)\n\n${ctx.appUrl}/p/${col.slug}` });
  } else if (p.purpose === 'giftcard') {
    await issueGiftCard(db, p.refId, ctx, now);
  } else if (p.purpose === 'print') {
    await submitPrint(db, p.refId, ctx);
  } else if (p.purpose === 'shop') {
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, p.refId) }))!;
    const seller = (await db.query.partners.findFirst({ where: eq(partners.id, o.partnerId!) }))!;
    await notify(db, [seller.userId], { title: 'New order to send', body: `${formatMoney(o.amount, o.currency)} · ${(JSON.parse(o.details) as { title: string }).title}`, link: '/partners' });
  }
}

export async function issueGiftCard(db: DB, orderId: string, ctx: Ctx, now = new Date()) {
  const gc = await db.query.giftCards.findFirst({ where: eq(giftCards.orderId, orderId) });
  if (!gc || gc.codeEnc) return;
  const issued = await (ctx.giftcards ?? giftCardProviderFromEnv()).issue({ brand: gc.brand, value: gc.value, currency: gc.currency, ref: orderId });
  await db.update(giftCards).set({ codeEnc: encrypt(issued.code), pinEnc: issued.pin ? encrypt(issued.pin) : null, expiresOn: issued.expiresOn }).where(eq(giftCards.id, gc.id));
  await db.update(orders).set({ status: 'paid', providerRef: issued.providerRef, updatedAt: now }).where(eq(orders.id, orderId));
  if (gc.deliverAt <= now) await deliverGiftCard(db, gc.id, ctx, now);
}

export async function deliverGiftCard(db: DB, id: string, ctx: Ctx, now = new Date()) {
  const gc = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
  if (!gc || gc.deliveredAt || !gc.codeEnc) return false;
  const o = (await db.query.orders.findFirst({ where: eq(orders.id, gc.orderId) }))!;
  const buyer = o.userId ? await db.query.users.findFirst({ where: eq(users.id, o.userId) }) : null;
  const b = brand(gc.brand);
  await sendEmail(db, ctx.email, {
    to: gc.recipientEmail,
    subject: `${buyer?.name ?? 'Someone'} sent you a ${b?.name ?? ''} gift card`,
    text: `Hi ${gc.recipientName},\n\n${buyer?.name ?? 'Someone'} sent you a ${formatMoney(gc.value, gc.currency)} ${b?.name ?? ''} gift card.${gc.message ? `\n\n“${gc.message}”` : ''}\n\nOpen it here: ${ctx.appUrl}/g/${gc.token}\n\n(TEST MODE — this is a sandbox card and can’t be spent.)`
  });
  await db.update(giftCards).set({ deliveredAt: now }).where(eq(giftCards.id, gc.id));
  await db.update(orders).set({ status: 'delivered', updatedAt: now }).where(eq(orders.id, gc.orderId));
  return true;
}

export async function submitPrint(db: DB, orderId: string, ctx: Ctx) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o || o.providerRef || o.status !== 'paid') return;
  const d = JSON.parse(o.details) as { frontFileId: string; insideFileId: string; quantity: number; address: PrintAddress };
  const r = await (ctx.printer ?? printProviderFromEnv()).submit({ orderId: o.id, frontUrl: ctx.appUrl + fileUrl(d.frontFileId), insideUrl: ctx.appUrl + fileUrl(d.insideFileId), quantity: d.quantity, address: d.address });
  await db.update(orders).set({ status: 'in_production', providerRef: r.providerRef, updatedAt: new Date() }).where(eq(orders.id, o.id));
}

/** Job runner: deliver scheduled gift cards, retry failed fulfilment, follow print orders. */
export async function moneyJobs(db: DB, ctx: Ctx, now = new Date()) {
  if (!moneyEnabled()) return { giftCards: 0, prints: 0 };
  let gc = 0, pr = 0;
  const due = await db.select({ id: giftCards.id }).from(giftCards).innerJoin(orders, eq(orders.id, giftCards.orderId)).where(and(lte(giftCards.deliverAt, now), sql`${giftCards.deliveredAt} is null`, sql`${giftCards.codeEnc} is not null`, eq(orders.status, 'paid')));
  for (const g of due) if (await deliverGiftCard(db, g.id, ctx, now).catch((e) => { console.error('[money] gift card delivery', e); return false; })) gc++;
  const unissued = await db.select({ orderId: giftCards.orderId }).from(giftCards).innerJoin(orders, eq(orders.id, giftCards.orderId)).where(and(sql`${giftCards.codeEnc} is null`, eq(orders.status, 'paid')));
  for (const g of unissued) await issueGiftCard(db, g.orderId, ctx, now).catch((e) => console.error('[money] gift card issue', e));
  const printer = ctx.printer ?? printProviderFromEnv();
  for (const o of await db.select().from(orders).where(and(eq(orders.kind, 'print'), eq(orders.status, 'paid')))) await submitPrint(db, o.id, ctx).catch((e) => console.error('[money] print submit', e));
  for (const o of await db.select().from(orders).where(and(eq(orders.kind, 'print'), inArray(orders.status, ['in_production', 'shipped'])))) {
    const s = await printer.status(o.providerRef!, o.createdAt, now).catch(() => null);
    if (s && s.status !== o.status) {
      await db.update(orders).set({ status: s.status, tracking: s.tracking ?? o.tracking, updatedAt: now }).where(eq(orders.id, o.id));
      if (o.userId) await notify(db, [o.userId], { title: s.status === 'shipped' ? 'Your printed cards are on their way' : s.status === 'delivered' ? 'Your printed cards were delivered' : 'Print order update', body: s.tracking ? `Tracking: ${s.tracking}` : '', link: '/orders' });
      pr++;
    }
  }
  return { giftCards: gc, prints: pr };
}

/* ---------------- Balances and payouts ---------------- */

export async function balance(db: DB, acct: string) {
  const rows = await db.select({ currency: ledgerEntries.currency, total: sql<number>`sum(${ledgerEntries.amount})::int` }).from(ledgerEntries).where(eq(ledgerEntries.account, acct)).groupBy(ledgerEntries.currency);
  return Object.fromEntries(rows.map((r) => [r.currency, r.total])) as Record<string, number>;
}

/** Who may move money out of an account: the pot organiser, or the partner's owner. */
async function ownsAccount(db: DB, userId: string, acct: string) {
  const [kind, id] = acct.split(':');
  if (kind === 'collection') return !!(await db.query.collections.findFirst({ where: and(eq(collections.id, id), eq(collections.userId, userId)) }));
  if (kind === 'partner') return !!(await db.query.partners.findFirst({ where: and(eq(partners.id, id), eq(partners.userId, userId), eq(partners.status, 'approved')) }));
  return false;
}

export async function requestPayout(db: DB, userId: string, acct: string, currency: string) {
  assertMoney();
  if (!/^(collection|partner):[0-9a-f-]{36}$/.test(acct) || !(await ownsAccount(db, userId, acct))) throw notFound('Not found');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${acct}))`);
    const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` }).from(ledgerEntries).where(and(eq(ledgerEntries.account, acct), eq(ledgerEntries.currency, currency)));
    if (total <= 0) throw badRequest('There’s nothing to pay out');
    const [p] = await tx.insert(payouts).values({ account: acct, requestedBy: userId, amount: total, currency }).returning();
    await tx.insert(ledgerEntries).values({ account: acct, payoutId: p.id, amount: -total, currency, kind: 'payout', note: 'Payout requested' });
    return p;
  });
}

export async function listPayouts(db: DB, acct: string) {
  return db.select().from(payouts).where(eq(payouts.account, acct)).orderBy(desc(payouts.createdAt));
}

/* ---------------- Admin ---------------- */

export async function refundPayment(db: DB, id: string, now = new Date()) {
  assertMoney();
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, id)).for('update');
    if (!p) throw notFound('Payment not found');
    if (p.status !== 'paid') throw badRequest('Only paid payments can be refunded');
    const credits = await tx.select().from(ledgerEntries).where(and(eq(ledgerEntries.paymentId, p.id), inArray(ledgerEntries.kind, ['credit', 'fee'])));
    if (credits.length) await tx.insert(ledgerEntries).values(credits.map((c) => ({ account: c.account, paymentId: p.id, amount: -c.amount, currency: c.currency, kind: 'refund', note: 'Refund' })));
    await tx.update(payments).set({ status: 'refunded', refundedAt: now }).where(eq(payments.id, p.id));
    if (p.purpose === 'contribution') await tx.update(contributions).set({ status: 'refunded' }).where(eq(contributions.id, p.refId));
    else {
      await tx.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, p.refId));
      await voidCommission(tx, p.refId);
    }
  });
}

export async function decidePayout(db: DB, id: string, approve: boolean, reference: string | null, now = new Date()) {
  assertMoney();
  const p = await db.query.payouts.findFirst({ where: eq(payouts.id, id) });
  if (!p) throw notFound('Payout not found');
  if (p.status !== 'requested') throw badRequest('Already decided');
  await db.update(payouts).set({ status: approve ? 'paid' : 'rejected', reference, decidedAt: now }).where(eq(payouts.id, id));
  if (!approve) await db.insert(ledgerEntries).values({ account: p.account, payoutId: p.id, amount: p.amount, currency: p.currency, kind: 'payout', note: 'Payout rejected — returned to balance' });
}

export async function adminMoneyOverview(db: DB) {
  const recent = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
  const pendingPayouts = await db.select().from(payouts).where(eq(payouts.status, 'requested')).orderBy(desc(payouts.createdAt));
  const totals = await db.select({ status: payments.status, currency: payments.currency, n: sql<number>`count(*)::int`, sum: sql<number>`sum(${payments.amount})::int` }).from(payments).groupBy(payments.status, payments.currency);
  return { recent, pendingPayouts, totals, platform: await balance(db, account.platform) };
}

