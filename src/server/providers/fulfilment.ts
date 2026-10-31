import { createHash, randomBytes } from 'node:crypto';

/* ---------------- Gift cards ---------------- */

export interface GiftCardProvider {
  name: string;
  /** Buys one card from the aggregator. `ref` is our order id (idempotency key). */
  issue(o: { brand: string; value: number; currency: string; ref: string }): Promise<{ code: string; pin: string | null; expiresOn: string | null; providerRef: string }>;
}

/** Sandbox: makes up a code. A real aggregator (Tillo, Xoxoday, Runa) plugs in behind the same interface. */
export class TestGiftCardProvider implements GiftCardProvider {
  name = 'test';
  async issue(o: { brand: string; ref: string }) {
    const code = `TEST-${o.brand.slice(0, 4).toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')}`;
    const exp = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    return { code, pin: String(createHash('sha256').update(o.ref).digest().readUInt32BE(0) % 10000).padStart(4, '0'), expiresOn: exp, providerRef: `test_gc_${o.ref.slice(0, 8)}` };
  }
}

/* ---------------- Printed cards ---------------- */

export type PrintAddress = { name: string; line1: string; line2?: string | null; city: string; state?: string | null; postcode: string; country: string };
export type PrintStatus = { status: 'in_production' | 'shipped' | 'delivered' | 'cancelled'; tracking?: string | null };

export interface PrintProvider {
  name: string;
  submit(o: { orderId: string; frontUrl: string; insideUrl: string; quantity: number; address: PrintAddress }): Promise<{ providerRef: string }>;
  status(providerRef: string, createdAt: Date, now: Date): Promise<PrintStatus>;
}

/** Sandbox print partner: pretends to print (a day), ship (with tracking) and deliver (four days). */
export class TestPrintProvider implements PrintProvider {
  name = 'test';
  async submit(o: { orderId: string }) { return { providerRef: `test_print_${o.orderId.slice(0, 8)}` }; }
  async status(ref: string, createdAt: Date, now: Date): Promise<PrintStatus> {
    const hours = (now.getTime() - createdAt.getTime()) / 3600000;
    if (hours >= 96) return { status: 'delivered', tracking: `TRK${ref.slice(-8).toUpperCase()}` };
    if (hours >= 24) return { status: 'shipped', tracking: `TRK${ref.slice(-8).toUpperCase()}` };
    return { status: 'in_production' };
  }
}

export const giftCardProviderFromEnv = (): GiftCardProvider => new TestGiftCardProvider();
export const printProviderFromEnv = (): PrintProvider => new TestPrintProvider();
