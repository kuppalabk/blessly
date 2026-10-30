import type { CalDate } from './dates';
import { compare, fromISO } from './dates';
import type { OccasionId } from './i18n-data';

export type Region = 'IN' | 'GB' | 'US' | 'AE' | 'GLOBAL';

export type Festival = {
  id: string;
  name: string;
  occasion: OccasionId | null; // which card set to use
  regions: Region[];
  /** Fixed-date festivals use month/day; lunar ones list dates per year. */
  fixed?: { m: number; d: number };
  dates?: Record<number, string>;
  /** Festivals with a calendar rule are computed for any year. */
  rule?: 'easter' | 'us-thanksgiving' | 'mothering-sunday' | 'us-mothers-day' | 'fathers-day' | 'friendship-day';
  /** Lunar dates depend on moon sighting or local almanacs; an editor must confirm them each year. */
  approximate?: boolean;
};

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(y: number): CalDate {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/** The nth given weekday (0 = Sunday) of a month. */
export function nthWeekday(y: number, m: number, weekday: number, nth: number): CalDate {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return { y, m, d: 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7 };
}

/** UK Mothering Sunday: three weeks before Easter Sunday. */
export function motheringSunday(y: number): CalDate {
  const e = easterSunday(y);
  const t = new Date(Date.UTC(y, e.m - 1, e.d - 21));
  return { y, m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** US Thanksgiving: the fourth Thursday of November. */
export function usThanksgiving(y: number): CalDate {
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(); // 0 = Sunday
  return { y, m: 11, d: 1 + ((4 - first + 7) % 7) + 21 };
}

/**
 * Festival calendar. Lunar dates checked October 2026 against Drik Panchang-based almanacs and
 * UAE/Gulf moon-sighting forecasts (Islamic dates may move by a day after sighting). Admins can correct
 * or add years without a release (Platform admin → Content). Lunar-calendar dates must be re-checked every year
 * (Super admin > Festivals & regions) before they are shown as final.
 */
export const FESTIVALS: Festival[] = [
  { id: 'new-year', name: 'New Year', occasion: 'newyear', regions: ['GLOBAL'], fixed: { m: 1, d: 1 } },
  { id: 'makar-sankranti', name: 'Makar Sankranti / Pongal', occasion: 'sankranti', regions: ['IN'], fixed: { m: 1, d: 14 } },
  { id: 'chinese-new-year', name: 'Lunar New Year', occasion: 'newyear', regions: ['GLOBAL'], dates: { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' }, approximate: true },
  { id: 'holi', name: 'Holi', occasion: 'holi', regions: ['IN'], dates: { 2026: '2026-03-04', 2027: '2027-03-22', 2028: '2028-03-11' }, approximate: true },
  { id: 'eid-al-fitr', name: 'Eid al-Fitr', occasion: 'eid', regions: ['IN', 'GB', 'US', 'AE', 'GLOBAL'], dates: { 2026: '2026-03-20', 2027: '2027-03-09', 2028: '2028-02-26' }, approximate: true },
  { id: 'easter', name: 'Easter', occasion: 'easter', regions: ['GB', 'US', 'GLOBAL'], rule: 'easter' },
  { id: 'eid-al-adha', name: 'Eid al-Adha', occasion: 'eid', regions: ['IN', 'GB', 'US', 'AE', 'GLOBAL'], dates: { 2026: '2026-05-27', 2027: '2027-05-16', 2028: '2028-05-04' }, approximate: true },
  { id: 'raksha-bandhan', name: 'Raksha Bandhan', occasion: 'rakhi', regions: ['IN'], dates: { 2026: '2026-08-28', 2027: '2027-08-17', 2028: '2028-08-05' }, approximate: true },
  { id: 'navratri', name: 'Navratri begins', occasion: 'navratri', regions: ['IN'], dates: { 2026: '2026-10-11', 2027: '2027-09-30', 2028: '2028-09-19' }, approximate: true },
  { id: 'diwali', name: 'Diwali', occasion: 'diwali', regions: ['IN', 'GB', 'US', 'GLOBAL'], dates: { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' }, approximate: true },
  { id: 'bonfire-night', name: 'Bonfire Night', occasion: null, regions: ['GB'], fixed: { m: 11, d: 5 } },
  { id: 'thanksgiving-us', name: 'Thanksgiving', occasion: 'thanksgiving', regions: ['US'], rule: 'us-thanksgiving' },
  { id: 'valentines', name: 'Valentine’s Day', occasion: 'valentines', regions: ['GLOBAL'], fixed: { m: 2, d: 14 } },
  { id: 'ramadan', name: 'Ramadan begins', occasion: 'ramadan', regions: ['IN', 'GB', 'US', 'AE', 'GLOBAL'], dates: { 2026: '2026-02-18', 2027: '2027-02-08', 2028: '2028-01-28' }, approximate: true },
  { id: 'mothering-sunday', name: 'Mother’s Day', occasion: 'mothersday', regions: ['GB'], rule: 'mothering-sunday' },
  { id: 'vaisakhi', name: 'Vaisakhi', occasion: 'vaisakhi', regions: ['IN', 'GB'], dates: { 2026: '2026-04-14', 2027: '2027-04-14', 2028: '2028-04-13' } },
  { id: 'mothers-day', name: 'Mother’s Day', occasion: 'mothersday', regions: ['US', 'IN', 'AE'], rule: 'us-mothers-day' },
  { id: 'vesak', name: 'Vesak', occasion: 'vesak', regions: ['GB', 'US', 'AE'], dates: { 2026: '2026-05-31', 2027: '2027-05-20', 2028: '2028-05-09' }, approximate: true },
  { id: 'fathers-day', name: 'Father’s Day', occasion: 'fathersday', regions: ['GB', 'US', 'IN', 'AE'], rule: 'fathers-day' },
  { id: 'friendship-day', name: 'Friendship Day', occasion: 'friendship', regions: ['IN', 'US'], rule: 'friendship-day' },
  { id: 'teachers-day-in', name: 'Teachers’ Day', occasion: 'teacher', regions: ['IN'], fixed: { m: 9, d: 5 } },
  { id: 'halloween', name: 'Halloween', occasion: 'halloween', regions: ['GB', 'US'], fixed: { m: 10, d: 31 } },
  { id: 'hanukkah', name: 'Hanukkah', occasion: 'hanukkah', regions: ['GB', 'US'], dates: { 2026: '2026-12-05', 2027: '2027-12-25', 2028: '2028-12-12' } },
  { id: 'christmas', name: 'Christmas', occasion: 'christmas', regions: ['IN', 'GB', 'US', 'GLOBAL'], fixed: { m: 12, d: 25 } }
];

export type FestivalOccurrence = { festival: Festival; date: CalDate };

/** Dates managed by admins (festival_dates table): add a year, correct a date, hide one, or add a new festival. */
export type FestivalDateRow = { festivalId: string; name: string; occasion: string | null; regions: string; date: string; approximate: boolean; hidden: boolean };

/** Festivals in [from, to] inclusive, for the user's country (always including GLOBAL), sorted by date. Admin rows win over built-in dates for the same festival and year. */
export function festivalsBetween(from: CalDate, to: CalDate, country: string, extra: FestivalDateRow[] = []): FestivalOccurrence[] {
  const region = (['IN', 'GB', 'US', 'AE'].includes(country) ? country : 'GLOBAL') as Region;
  const inRange = (d: CalDate) => compare(d, from) >= 0 && compare(d, to) <= 0;
  const overridden = new Set(extra.map((r) => `${r.festivalId}:${r.date.slice(0, 4)}`));
  const out: FestivalOccurrence[] = [];
  for (const f of FESTIVALS) {
    if (!f.regions.includes(region) && !f.regions.includes('GLOBAL')) continue;
    for (let y = from.y; y <= to.y; y++) {
      if (overridden.has(`${f.id}:${y}`)) continue;
      let date: CalDate | null = null;
      if (f.fixed) date = { y, m: f.fixed.m, d: f.fixed.d };
      else if (f.rule === 'easter') date = easterSunday(y);
      else if (f.rule === 'us-thanksgiving') date = usThanksgiving(y);
      else if (f.rule === 'mothering-sunday') date = motheringSunday(y);
      else if (f.rule === 'us-mothers-day') date = nthWeekday(y, 5, 0, 2);
      else if (f.rule === 'fathers-day') date = nthWeekday(y, 6, 0, 3);
      else if (f.rule === 'friendship-day') date = nthWeekday(y, 8, 0, 1);
      else if (f.dates?.[y]) date = fromISO(f.dates[y]);
      if (date && inRange(date)) out.push({ festival: f, date });
    }
  }
  for (const r of extra) {
    if (r.hidden) continue;
    const regions = r.regions.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) as Region[];
    if (!regions.includes(region) && !regions.includes('GLOBAL')) continue;
    const date = fromISO(r.date);
    if (!inRange(date)) continue;
    const builtin = FESTIVALS.find((f) => f.id === r.festivalId);
    out.push({ festival: { ...(builtin ?? {}), id: r.festivalId, name: r.name, occasion: (r.occasion as OccasionId | null) ?? builtin?.occasion ?? null, regions, approximate: r.approximate }, date });
  }
  return out.sort((a, b) => compare(a.date, b.date));
}
