import type { Currency } from './money';

/**
 * Sandbox gift card catalogue. These are made-up brands for test mode — a real catalogue comes from
 * a gift card aggregator (e.g. Tillo, Xoxoday or Runa) once a commercial agreement is in place.
 */
export type Brand = { id: string; name: string; category: string; emoji: string; color: string; denominations: Partial<Record<Currency, number[]>>; terms: string };

const d = (inr: number[], other: number[]) => ({ INR: inr.map((x) => x * 100), USD: other.map((x) => x * 100), GBP: other.map((x) => x * 100), EUR: other.map((x) => x * 100), AED: other.map((x) => x * 400) });

export const BRANDS: Brand[] = [
  { id: 'pageturner', name: 'Pageturner Books', category: 'Books', emoji: '📚', color: '#2b6cb0', denominations: d([500, 1000, 2000], [10, 25, 50]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'bean-and-leaf', name: 'Bean & Leaf Café', category: 'Food & drink', emoji: '☕', color: '#7a4b2a', denominations: d([250, 500, 1000], [10, 20, 30]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'cinemagic', name: 'Cinemagic', category: 'Experiences', emoji: '🎬', color: '#b3261e', denominations: d([500, 1000, 1500], [15, 30, 60]), terms: 'Sandbox brand for testing. Valid 12 months.' },
  { id: 'bloom-box', name: 'Bloom Box Flowers', category: 'Flowers', emoji: '💐', color: '#e75480', denominations: d([750, 1500, 3000], [20, 40, 75]), terms: 'Sandbox brand for testing. Valid 6 months.' },
  { id: 'wanderlust', name: 'Wanderlust Stays', category: 'Travel', emoji: '🧳', color: '#1f6b4f', denominations: d([2000, 5000, 10000], [50, 100, 250]), terms: 'Sandbox brand for testing. Valid 24 months.' },
  { id: 'spa-calm', name: 'Calm Spa', category: 'Wellbeing', emoji: '🧖', color: '#5b3fd1', denominations: d([1500, 3000, 5000], [30, 60, 100]), terms: 'Sandbox brand for testing. Valid 12 months.' }
];
export const brand = (id: string) => BRANDS.find((b) => b.id === id) ?? null;
