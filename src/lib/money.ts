export const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(minor: number | null | undefined, currency: string | null | undefined) {
  if (minor == null) return null;
  const c = currency ?? 'INR';
  return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : c === 'AED' ? 'en-AE' : 'en-GB', { style: 'currency', currency: c, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/** "1,499.50" or "24.99" → minor units. */
export function parseAmount(s: string) {
  const clean = String(s).replace(/[,\s]/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const currencyFor = (country: string): Currency => (({ IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED' } as Record<string, Currency>)[country] ?? 'EUR');

/** Smallest and largest single payment we accept, per currency (minor units). */
export const LIMITS: Record<Currency, [number, number]> = { INR: [1000, 50_000_000], USD: [100, 1_000_000], GBP: [100, 1_000_000], EUR: [100, 1_000_000], AED: [500, 3_000_000] };

/** Seller commission (basis points). */
export const SHOP_COMMISSION_BP = 1000;
