import * as WebBrowser from 'expo-web-browser';
import { api } from './client';
import { webUrl } from './account';

/* ---------------- Money helpers (same rules as the website, src/lib/money.ts) ---------------- */

export const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Amounts are stored in minor units (paise, cents, fils). */
export function formatMoney(minor: number | null | undefined, currency: string | null | undefined) {
  if (minor == null) return '';
  const c = currency ?? 'INR';
  const locale = c === 'INR' ? 'en-IN' : c === 'USD' ? 'en-US' : c === 'AED' ? 'en-AE' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/** "1,499.50" or "24.99" to minor units, or null when it isn't an amount. */
export function parseAmount(s: string) {
  const clean = String(s).replace(/[,\s]/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const currencyFor = (country: string): Currency =>
  (({ IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED' } as Record<string, Currency>)[country] ?? 'EUR');

/** Printed cards: price per card in minor units, and the countries we post to. Mirrors server/services/marketplace.ts. */
export const PRINT_PRICE: Record<Currency, number> = { INR: 24900, GBP: 399, USD: 499, EUR: 449, AED: 1900 };
export const PRINT_COUNTRIES = ['IN', 'GB', 'US', 'AE', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT', 'CA', 'AU'];

/**
 * Sandbox gift card catalogue. Mirrors src/lib/giftcards.ts (static on the website too).
 * Denominations are in minor units.
 */
export type Brand = { id: string; name: string; category: string; emoji: string; color: string; denominations: Partial<Record<Currency, number[]>>; terms: string };

const denoms = (inr: number[], other: number[]): Brand['denominations'] => ({
  INR: inr.map((x) => x * 100), USD: other.map((x) => x * 100), GBP: other.map((x) => x * 100), EUR: other.map((x) => x * 100), AED: other.map((x) => x * 400)
});

export const GIFT_BRANDS: Brand[] = [
  { id: 'pageturner', name: 'Pageturner Books', category: 'Books', emoji: '📚', color: '#2b6cb0', denominations: denoms([500, 1000, 2000], [10, 25, 50]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'bean-and-leaf', name: 'Bean & Leaf Café', category: 'Food & drink', emoji: '☕', color: '#7a4b2a', denominations: denoms([250, 500, 1000], [10, 20, 30]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'cinemagic', name: 'Cinemagic', category: 'Experiences', emoji: '🎬', color: '#b3261e', denominations: denoms([500, 1000, 1500], [15, 30, 60]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'bloom-box', name: 'Bloom Box Flowers', category: 'Flowers', emoji: '💐', color: '#e75480', denominations: denoms([750, 1500, 3000], [20, 40, 75]), terms: 'Sandbox brand for testing. Valid 6 months.' },
  { id: 'wanderlust', name: 'Wanderlust Stays', category: 'Travel', emoji: '🧳', color: '#1f6b4f', denominations: denoms([2000, 5000, 10000], [50, 100, 250]), terms: 'Sandbox brand for testing. Valid 24 months.' },
  { id: 'spa-calm', name: 'Calm Spa', category: 'Wellbeing', emoji: '🧖', color: '#5b3fd1', denominations: denoms([1500, 3000, 5000], [30, 60, 100]), terms: 'Sandbox brand for testing. Valid 12 months.' }
];

export type Address = { name: string; line1: string; line2: string; city: string; state: string; postcode: string; country: string; phone: string };

export const blankAddress = (country: string): Address => ({ name: '', line1: '', line2: '', city: '', state: '', postcode: '', country, phone: '' });

/* ---------------- Checkout ---------------- */

/**
 * Opens a payment page in the in-app browser. The server returns either a full provider link or a
 * relative page such as "/pay/<id>" (test mode), so relative links are resolved against the website.
 */
export async function openPayment(checkoutUrl: string) {
  await WebBrowser.openBrowserAsync(webUrl(checkoutUrl));
}

/* ---------------- Group gifts and fundraisers ---------------- */

export type PotSummary = {
  id: string; title: string; kind: 'gift' | 'fundraiser'; currency: string; target: number | null;
  deadline: string | null; closedAt: string | null; slug: string; raised: number; contributors: number;
};

export type PotDetail = {
  collection: { id: string; title: string; kind: 'gift' | 'fundraiser'; currency: string; target: number | null; closedAt: string | null; slug: string; showAmounts: boolean };
  contributions: { id: string; name: string; email: string; amount: number; currency: string; message: string | null; anonymous: boolean }[];
  raised: number;
  charity: { name: string } | null;
  balance: Record<string, number>;
  payouts: { id: string; amount: number; currency: string; status: string; reference: string | null; createdAt: string }[];
};

export type PotInput = {
  kind: 'gift' | 'fundraiser'; title: string; story?: string | null; recipientName?: string | null; currency: string;
  target?: number | null; deadline?: string | null; charityId?: string | null; celebrationId?: string | null; wishlistItemId?: string | null; showAmounts: boolean;
};

export const listPots = () => api<{ pots: PotSummary[] }>('/pots');
export const createPot = (body: PotInput) => api<{ pot: { id: string } }>('/pots', { method: 'POST', body });
export const getPot = (id: string) => api<PotDetail>(`/pots/${id}`);
export const closePot = (id: string) => api<{ ok: boolean }>(`/pots/${id}`, { method: 'POST' });

/** Pays out a balance. account is "collection:<id>" or "partner:<id>". */
export const requestPayout = (account: string, currency: string) =>
  api<{ payout: unknown }>('/payouts', { method: 'POST', body: { account, currency } });

export type CelebrationLite = { id: string; title: string; cancelledAt: string | null };
export const listCelebrationsLite = () => api<{ celebrations: CelebrationLite[] }>('/celebrations');

/** Charities that fundraisers can choose. Needs a GET route on the server (the website reads this on the server side). */
export type Charity = { id: string; name: string; country: string };
export const listCharities = () => api<{ charities: Charity[] }>('/charities');

/* ---------------- Shop ---------------- */

export type ShopProduct = {
  id: string; title: string; description: string | null; price: string; priceMinor: number; currency: string;
  stock: number; seller: string; countries: string[]; imageUrl: string | null;
};

/** Live products. Needs a GET route on the server (the website reads this on the server side). */
export const listShop = () => api<{ products: ShopProduct[] }>('/shop');

export const buyProduct = (body: { productId: string; quantity: number; address: Address; giftMessage: string | null }) =>
  api<{ paymentId: string; checkoutUrl: string }>('/shop/buy', { method: 'POST', body });

/* ---------------- Gift cards ---------------- */

export const buyGiftCard = (body: {
  brand: string; currency: string; value: number; recipientName: string; recipientEmail: string; message?: string; deliverOn?: string;
}) => api<{ paymentId: string; checkoutUrl: string }>('/giftcards', { method: 'POST', body });

/* ---------------- Orders ---------------- */

export type OrderRow = {
  id: string; kind: 'giftcard' | 'print' | 'shop'; status: string; amount: string; createdAt: string; tracking: string | null; title: string;
};

/** The signed-in user's orders. Needs a GET route on the server (the website reads this on the server side). */
export const listOrders = () => api<{ orders: OrderRow[] }>('/orders');

/* ---------------- Partners: sellers, designers, charities ---------------- */

export type PartnerKind = 'seller' | 'designer' | 'charity';
export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type Partnership = {
  partner: { id: string; kind: PartnerKind; name: string; status: PartnerStatus; reviewNote: string | null };
  balance: Record<string, number>;
  payouts: { id: string; amount: number; currency: string; status: string }[];
  products: { id: string; title: string; priceText: string; stock: number; status: string; imageUrl: string | null }[];
  orders: { id: string; status: string; amount: string; tracking: string | null; details: Record<string, unknown> }[];
  designs: { id: string; title: string; status: string; uses: number; imageUrl: string }[];
  donations: { name: string; amount: string; fundraiser: string; at: string }[];
};

export const listPartnerships = () => api<{ partners: Partnership[] }>('/partners');

export const applyPartner = (body: { kind: PartnerKind; name: string; country: string; website?: string; regNumber?: string; description?: string }) =>
  api<{ partner: unknown }>('/partners', { method: 'POST', body });

export const addProduct = (body: { title: string; description?: string; price: number; currency: string; stock: number; countries: string }) =>
  api<{ product: unknown }>('/partners/products', { method: 'POST', body });

/** Seller: marks an order shipped or delivered. */
export const updateSellerOrder = (id: string, status: 'shipped' | 'delivered', tracking: string) =>
  api<{ ok: boolean }>(`/partners/orders/${id}`, { method: 'PUT', body: { status, tracking } });
