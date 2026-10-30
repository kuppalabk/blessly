/** Calendar-date helpers. Calendar dates are plain {y, m, d} (month 1-12) with no timezone. */
export type CalDate = { y: number; m: number; d: number };

export function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidMonthDay(m: number, d: number) {
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(2024, m);
}

export function toISO({ y, m, d }: CalDate) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function fromISO(s: string): CalDate {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function addDays(c: CalDate, n: number): CalDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function compare(a: CalDate, b: CalDate) {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

export function daysBetween(a: CalDate, b: CalDate) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** The calendar date "now" falls on in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): CalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Offset in minutes of the timezone from UTC at the given instant (e.g. +330 for India). */
function offsetMinutes(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of a local wall-clock time in a timezone. Handles DST changes. */
export function zonedTime(c: CalDate, hour: number, minute: number, timezone: string): Date {
  const guess = Date.UTC(c.y, c.m - 1, c.d, hour, minute);
  let off = offsetMinutes(timezone, new Date(guess));
  let result = guess - off * 60000;
  const off2 = offsetMinutes(timezone, new Date(result));
  if (off2 !== off) result = guess - off2 * 60000;
  return new Date(result);
}

/**
 * Next date on or after `from` that a yearly month/day falls on.
 * 29 February is observed on 28 February in non-leap years.
 */
export function nextYearly(month: number, day: number, from: CalDate): CalDate {
  for (const y of [from.y, from.y + 1]) {
    const d = month === 2 && day === 29 && !isLeapYear(y) ? 28 : day;
    const c = { y, m: month, d };
    if (compare(c, from) >= 0) return c;
  }
  throw new Error('unreachable');
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDate(c: CalDate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }, locale = 'en-GB') {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(c.y, c.m - 1, c.d)));
}
