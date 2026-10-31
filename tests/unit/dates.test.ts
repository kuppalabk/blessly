import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, nextYearly, todayIn, zonedTime, isValidMonthDay, isValidTimezone } from '@/lib/dates';

describe('dates', () => {
  it('finds the next yearly occurrence on or after today', () => {
    expect(nextYearly(11, 8, { y: 2026, m: 10, d: 26 })).toEqual({ y: 2026, m: 11, d: 8 });
    expect(nextYearly(10, 26, { y: 2026, m: 10, d: 26 })).toEqual({ y: 2026, m: 10, d: 26 });
    expect(nextYearly(1, 5, { y: 2026, m: 10, d: 26 })).toEqual({ y: 2027, m: 1, d: 5 });
  });

  it('observes 29 February on 28 February in non-leap years', () => {
    expect(nextYearly(2, 29, { y: 2026, m: 10, d: 26 })).toEqual({ y: 2027, m: 2, d: 28 });
    expect(nextYearly(2, 29, { y: 2027, m: 3, d: 1 })).toEqual({ y: 2028, m: 2, d: 29 });
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays({ y: 2026, m: 12, d: 30 }, 3)).toEqual({ y: 2027, m: 1, d: 2 });
    expect(addDays({ y: 2026, m: 3, d: 1 }, -1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(daysBetween({ y: 2026, m: 10, d: 26 }, { y: 2026, m: 11, d: 8 })).toBe(13);
  });

  it('computes local dates and times in different timezones', () => {
    const instant = new Date('2026-10-25T20:00:00Z');
    expect(todayIn('Asia/Kolkata', instant)).toEqual({ y: 2026, m: 10, d: 26 });
    expect(todayIn('America/New_York', instant)).toEqual({ y: 2026, m: 10, d: 25 });
    expect(zonedTime({ y: 2026, m: 11, d: 8 }, 9, 0, 'Asia/Kolkata').toISOString()).toBe('2026-11-08T03:30:00.000Z');
  });

  it('handles daylight saving changes', () => {
    // UK clocks went back on 25 Oct 2026: 9am before is BST (UTC+1), after is GMT.
    expect(zonedTime({ y: 2026, m: 10, d: 24 }, 9, 0, 'Europe/London').toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(zonedTime({ y: 2026, m: 10, d: 26 }, 9, 0, 'Europe/London').toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });

  it('validates input', () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(2, 30)).toBe(false);
    expect(isValidMonthDay(13, 1)).toBe(false);
    expect(isValidTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
});

import { rateLimit } from '@/server/http';
describe('rate limiting', () => {
  it('allows up to the limit then rejects with 429', async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60000);
    await expect(rateLimit(key, 3, 60000)).rejects.toMatchObject({ status: 429 });
  });
});
