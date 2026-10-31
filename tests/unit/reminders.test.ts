import { describe, expect, it } from 'vitest';
import { planReminders, reminderCopy } from '@/lib/reminders';
import { easterSunday, festivalsBetween, FESTIVALS, motheringSunday, nthWeekday, usThanksgiving } from '@/lib/festivals';

const occ = { id: 'o1', month: 11, day: 12, remindGift: true, remindIdeas: true, remindDraft: true, remindDay: true };

describe('reminder planning', () => {
  it('plans all four stages at local times for an occasion inside the horizon', () => {
    const now = new Date('2026-10-30T00:00:00Z');
    const plan = planReminders(occ, 'Asia/Kolkata', now);
    expect(plan.map((p) => [p.stage, p.dueAt.toISOString()])).toEqual([
      ['gift', '2026-11-05T03:30:00.000Z'],
      ['ideas', '2026-11-09T03:30:00.000Z'],
      ['draft', '2026-11-11T12:30:00.000Z'],
      ['day', '2026-11-12T03:30:00.000Z']
    ]);
    expect(plan[0].eventDate).toEqual({ y: 2026, m: 11, d: 12 });
  });

  it('plans nothing when the occasion is beyond the horizon', () => {
    expect(planReminders(occ, 'Asia/Kolkata', new Date('2026-09-01T00:00:00Z'))).toEqual([]);
  });

  it('skips stages that have passed but still sends the day reminder on the day', () => {
    const now = new Date('2026-11-12T10:00:00Z'); // 3:30pm in India on the day
    const plan = planReminders(occ, 'Asia/Kolkata', now);
    expect(plan.map((p) => p.stage)).toEqual(['day']);
    expect(plan[0].dueAt).toEqual(now);
  });

  it('respects disabled stages', () => {
    const plan = planReminders({ ...occ, remindGift: false, remindIdeas: false }, 'Asia/Kolkata', new Date('2026-10-30T00:00:00Z'));
    expect(plan.map((p) => p.stage)).toEqual(['draft', 'day']);
  });

  it('writes reminder copy', () => {
    expect(reminderCopy('gift', 'Rohan', 'anniversary', 7).title).toBe("Rohan's anniversary in 7 days");
    expect(reminderCopy('day', 'Nisha', 'birthday', 0).title).toBe("It's Nisha's birthday today");
  });
});

describe('festival calendar', () => {
  it('lists November 2026 festivals for India in order', () => {
    const list = festivalsBetween({ y: 2026, m: 11, d: 1 }, { y: 2026, m: 11, d: 30 }, 'IN');
    expect(list.map((f) => f.festival.id)).toEqual(['diwali']);
  });

  it('includes UK-only festivals for the UK', () => {
    const list = festivalsBetween({ y: 2026, m: 11, d: 1 }, { y: 2026, m: 12, d: 31 }, 'GB');
    expect(list.map((f) => f.festival.id)).toEqual(['bonfire-night', 'diwali', 'hanukkah', 'christmas']);
  });

  it('spans year boundaries', () => {
    const list = festivalsBetween({ y: 2026, m: 12, d: 20 }, { y: 2027, m: 1, d: 10 }, 'US');
    expect(list.map((f) => f.festival.id)).toEqual(['christmas', 'new-year']);
  });
});

describe('festival calendar rules', () => {
  it('computes Easter and US Thanksgiving for any year', () => {
    expect([2026, 2027, 2028, 2029, 2030].map((y) => easterSunday(y))).toEqual([
      { y: 2026, m: 4, d: 5 }, { y: 2027, m: 3, d: 28 }, { y: 2028, m: 4, d: 16 }, { y: 2029, m: 4, d: 1 }, { y: 2030, m: 4, d: 21 }
    ]);
    expect([2026, 2027, 2028].map((y) => usThanksgiving(y).d)).toEqual([26, 25, 23]);
  });

  it('computes Mother’s, Father’s and Friendship Day', () => {
    expect(motheringSunday(2026)).toEqual({ y: 2026, m: 3, d: 15 });
    expect(motheringSunday(2027)).toEqual({ y: 2027, m: 3, d: 7 });
    expect(nthWeekday(2026, 5, 0, 2)).toEqual({ y: 2026, m: 5, d: 10 });
    expect(nthWeekday(2026, 6, 0, 3)).toEqual({ y: 2026, m: 6, d: 21 });
    expect(nthWeekday(2026, 8, 0, 1)).toEqual({ y: 2026, m: 8, d: 2 });
    const uk = festivalsBetween({ y: 2027, m: 1, d: 1 }, { y: 2027, m: 12, d: 31 }, 'GB').map((f) => f.festival.id);
    expect(uk).toEqual(expect.arrayContaining(['valentines', 'mothering-sunday', 'fathers-day', 'halloween', 'hanukkah', 'vaisakhi']));
    expect(uk).not.toContain('mothers-day');
  });

  it('has lunar dates through 2028 for every lunar festival', () => {
    for (const f of FESTIVALS.filter((x) => x.dates)) for (const y of [2026, 2027, 2028]) expect(f.dates![y], `${f.id} ${y}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
