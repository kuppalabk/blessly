import { cfg } from '../settings';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Payment providers, called over their REST APIs (no SDKs):
 * - Razorpay (India, INR): subscriptions with UPI AutoPay, cards, netbanking. Docs: razorpay.com/docs/api/payments/subscriptions
 * - Stripe (everyone else, USD): Checkout in subscription mode. Docs: docs.stripe.com/api/checkout/sessions
 * - Test: a fake checkout page for development and automated tests. Never available when live keys are set.
 */

export type CheckoutRequest = {
  subscriptionId: string; // our row id, echoed back in webhooks
  userId: string;
  email: string;
  planId: string;
  planName: string;
  interval: 'month' | 'year';
  currency: 'INR' | 'USD';
  amount: number; // smallest unit
  successUrl: string;
  cancelUrl: string;
  providerPriceId?: string | null; // Razorpay plan id for this exact price, if already created
};

export type CheckoutResult = { url: string; providerSubscriptionId: string | null; providerPriceId?: string };

export interface PaymentProvider {
  name: 'razorpay' | 'stripe' | 'test';
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
  cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void>;
  cancelNow(providerSubscriptionId: string): Promise<void>;
}

export class PaymentError extends Error {}

const hmacHex = (key: string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest('hex');
function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/* ---------------- Razorpay ---------------- */

export class RazorpayProvider implements PaymentProvider {
  name = 'razorpay' as const;
  constructor(private keyId: string, private keySecret: string, private fetchImpl: typeof fetch = fetch, private base = 'https://api.razorpay.com/v1') {}

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PaymentError(`Razorpay: ${(json as { error?: { description?: string } }).error?.description ?? res.status}`);
    return json as T;
  }

  async checkout(r: CheckoutRequest): Promise<CheckoutResult> {
    let planId = r.providerPriceId ?? null;
    if (!planId) {
      // Razorpay plans can't change price, so one is created per price and reused.
      const p = await this.call<{ id: string }>('/plans', {
        period: r.interval === 'year' ? 'yearly' : 'monthly', interval: 1,
        item: { name: `Blessly ${r.planName} (${r.interval === 'year' ? 'yearly' : 'monthly'})`, amount: r.amount, currency: 'INR' }
      });
      planId = p.id;
    }
    const sub = await this.call<{ id: string; short_url: string }>('/subscriptions', {
      plan_id: planId, total_count: r.interval === 'year' ? 10 : 120, quantity: 1, customer_notify: 1,
      notes: { subscriptionId: r.subscriptionId, userId: r.userId }
    });
    return { url: sub.short_url, providerSubscriptionId: sub.id, providerPriceId: planId };
  }

  async cancelAtPeriodEnd(id: string) { await this.call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 }); }
  async cancelNow(id: string) { await this.call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 0 }); }

  /** X-Razorpay-Signature = hex HMAC-SHA256 of the raw body with the webhook secret. */
  static verify(rawBody: string, signature: string | null, secret: string) {
    return !!signature && !!secret && safeEqualHex(signature, hmacHex(secret, rawBody));
  }
}

/* ---------------- Stripe ---------------- */

function form(obj: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p;
}

export class StripeProvider implements PaymentProvider {
  name = 'stripe' as const;
  constructor(private secretKey: string, private fetchImpl: typeof fetch = fetch, private base = 'https://api.stripe.com/v1') {}

  private async call<T>(path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body, signal: AbortSignal.timeout(20000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PaymentError(`Stripe: ${(json as { error?: { message?: string } }).error?.message ?? res.status}`);
    return json as T;
  }

  async checkout(r: CheckoutRequest): Promise<CheckoutResult> {
    const s = await this.call<{ id: string; url: string }>('/checkout/sessions', form({
      mode: 'subscription', success_url: r.successUrl, cancel_url: r.cancelUrl, client_reference_id: r.subscriptionId, customer_email: r.email,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': r.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': r.amount,
      'line_items[0][price_data][recurring][interval]': r.interval,
      'line_items[0][price_data][product_data][name]': `Blessly ${r.planName}`,
      'metadata[subscriptionId]': r.subscriptionId,
      'subscription_data[metadata][subscriptionId]': r.subscriptionId,
      'subscription_data[metadata][userId]': r.userId
    }), `checkout-${r.subscriptionId}`);
    return { url: s.url, providerSubscriptionId: null };
  }

  async cancelAtPeriodEnd(id: string) { await this.call(`/subscriptions/${encodeURIComponent(id)}`, form({ cancel_at_period_end: 'true' })); }
  async cancelNow(id: string) {
    const res = await this.fetchImpl(`${this.base}/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${this.secretKey}` } });
    if (!res.ok) throw new PaymentError(`Stripe: ${res.status}`);
  }

  /** Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body"> — rejected if older than 5 minutes. */
  static verify(rawBody: string, header: string | null, secret: string, now = Date.now()) {
    if (!header || !secret) return false;
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!t || Math.abs(now / 1000 - t) > 300) return false;
    const expected = hmacHex(secret, `${t}.${rawBody}`);
    return header.split(',').filter((kv) => kv.startsWith('v1=')).some((kv) => safeEqualHex(kv.slice(3), expected));
  }
}

/* ---------------- Test ---------------- */

export class TestProvider implements PaymentProvider {
  name = 'test' as const;
  constructor(private appUrl: string) {}
  async checkout(r: CheckoutRequest) {
    return { url: `${this.appUrl}/billing/test-checkout?s=${r.subscriptionId}`, providerSubscriptionId: `test_${r.subscriptionId}` };
  }
  async cancelAtPeriodEnd() {}
  async cancelNow() {}
}

/** Which provider handles a currency. Test mode only when explicitly enabled and no live keys exist. */
export function providerFor(currency: 'INR' | 'USD', appUrl: string): PaymentProvider | null {
  const rzp = cfg('RAZORPAY_KEY_ID') && cfg('RAZORPAY_KEY_SECRET');
  const stripe = cfg('STRIPE_SECRET_KEY');
  if (currency === 'INR' && rzp) return new RazorpayProvider(cfg('RAZORPAY_KEY_ID')!, cfg('RAZORPAY_KEY_SECRET')!);
  if (currency === 'USD' && stripe) return new StripeProvider(stripe);
  if (cfg('BILLING_TEST_MODE') === '1' && !rzp && !stripe) return new TestProvider(appUrl);
  return null;
}

export function providerByName(name: string): PaymentProvider | null {
  if (name === 'razorpay' && (cfg('RAZORPAY_KEY_ID') ?? '') && (cfg('RAZORPAY_KEY_SECRET') ?? '')) return new RazorpayProvider((cfg('RAZORPAY_KEY_ID') ?? ''), (cfg('RAZORPAY_KEY_SECRET') ?? ''));
  if (name === 'stripe' && (cfg('STRIPE_SECRET_KEY') ?? '')) return new StripeProvider((cfg('STRIPE_SECRET_KEY') ?? ''));
  if (name === 'test' && cfg('BILLING_TEST_MODE') === '1') return new TestProvider(process.env.APP_URL ?? '');
  return null;
}
