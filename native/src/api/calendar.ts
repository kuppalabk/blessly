import { deviceLanguage } from '../i18n';
import { api } from './client';

/** A calendar date, the same shape the website uses (no time of day). */
export type CalDate = { y: number; m: number; d: number };

/** One row from GET /api/upcoming (birthdays, anniversaries, festivals, family events). */
export type UpcomingItem = {
  key: string;
  type: 'person' | 'festival' | 'event';
  /** Where the website sends the user when the item is tapped. */
  href: string;
  title: string;
  subtitle: string;
  date: CalDate;
  daysAway: number;
  occasion: string | null;
  personId?: string;
  approximate?: boolean;
};

/** The server returns the next 60 days only. */
export const upcomingItems = () => api<{ items: UpcomingItem[] }>('/upcoming');

export function toISO({ y, m, d }: CalDate) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function fromISO(s: string): CalDate {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function daysBetween(a: CalDate, b: CalDate) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** Today on the device clock. The website uses the account timezone instead. */
export function todayLocal(now: Date = new Date()): CalDate {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export function formatCalDate(c: CalDate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(deviceLanguage(), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(c.y, c.m - 1, c.d)));
}
