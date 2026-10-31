import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { cardOverridesAll, missingFestivalYears, saveFestivalDate, sendAnnouncement, setCardOverride } from '@/server/services/content';
import { upcoming } from '@/server/services/home';
import { createBusiness } from '@/server/services/business';
import { designOrder } from '@/lib/cards';
import { festivalsBetween } from '@/lib/festivals';
import { notifications, users } from '@/server/schema';

beforeEach(resetDb);
afterAll(closeDb);

async function admin() {
  const a = await makeUser({ country: 'US' });
  await db().update(users).set({ role: 'admin' }).where(eq(users.id, a.id));
  return { id: a.id, email: a.email };
}

describe('festival calendar management', () => {
  it('admins add next year’s dates, correct a date, hide one, and add new festivals', async () => {
    const a = await admin();
    expect((await missingFestivalYears(db(), [2028]))).toEqual([]); // built in through 2028; Easter and Thanksgiving are calculated
    expect((await missingFestivalYears(db(), [2029])).map((m) => m.id)).toContain('diwali');
    await saveFestivalDate(db(), a, { festivalId: 'diwali', name: 'Diwali', occasion: 'diwali', regions: 'IN,GB,US,GLOBAL', date: '2029-11-05', approximate: true });
    expect((await missingFestivalYears(db(), [2029])).map((m) => m.id)).not.toContain('diwali');
    // Correct 2026 Holi, hide 2026 Easter, add Onam.
    await saveFestivalDate(db(), a, { festivalId: 'holi', name: 'Holi', occasion: 'holi', regions: 'IN', date: '2026-03-05' });
    await saveFestivalDate(db(), a, { festivalId: 'easter', name: 'Easter', regions: 'GB', date: '2026-04-05', hidden: true });
    await saveFestivalDate(db(), a, { festivalId: 'onam', name: 'Onam', regions: 'IN', date: '2026-08-26' });
    // Saving the same festival+year again replaces it.
    await saveFestivalDate(db(), a, { festivalId: 'onam', name: 'Onam', regions: 'IN', date: '2026-08-27' });
    const rows = (await import('@/server/services/content')).festivalExtras;
    const extra = await rows(db());
    const y2026 = festivalsBetween({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 12, d: 31 }, 'IN', extra);
    const find = (id: string) => y2026.filter((o) => o.festival.id === id).map((o) => `${o.date.m}-${o.date.d}`);
    expect(find('holi')).toEqual(['3-5']);
    expect(find('onam')).toEqual(['8-27']);
    expect(festivalsBetween({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 12, d: 31 }, 'GB', extra).some((o) => o.festival.id === 'easter')).toBe(false);
    const u = await makeUser({ country: 'IN' });
    expect((await upcoming(db(), { ...u, country: 'IN' }, 800, new Date('2027-09-01T00:00:00Z'))).map((i) => i.title)).toContain('Diwali');
    await expect(saveFestivalDate(db(), a, { festivalId: 'Bad ID', name: 'x', regions: 'IN', date: '2026-01-01' })).rejects.toThrow(/lowercase/);
  });
});

describe('card designs', () => {
  it('featured designs come first, hidden ones disappear, and at least 12 stay visible', async () => {
    const a = await admin();
    await setCardOverride(db(), a, { occasion: 'diwali', designIndex: 42, hidden: false, featured: true });
    await setCardOverride(db(), a, { occasion: 'diwali', designIndex: 0, hidden: true, featured: false });
    const o = (await cardOverridesAll(db())).diwali;
    const order = designOrder(o);
    expect(order[0]).toBe(42);
    expect(order).not.toContain(0);
    expect(order).toHaveLength(249);
    await expect(setCardOverride(db(), a, { occasion: 'diwali', designIndex: 1, hidden: true, featured: true })).rejects.toThrow(/both/);
    await setCardOverride(db(), a, { occasion: 'diwali', designIndex: 0, hidden: false, featured: false });
    expect(designOrder((await cardOverridesAll(db())).diwali)).toHaveLength(250);
  });
});

describe('announcements', () => {
  it('reach the chosen audience only, skipping suspended accounts', async () => {
    const a = await admin();
    const india = await makeUser({ country: 'IN' });
    const uk = await makeUser({ country: 'GB' });
    const owner = await makeUser({ country: 'GB' });
    await createBusiness(db(), owner.id, { name: 'Shop' });
    const gone = await makeUser({ country: 'IN' });
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, gone.id));
    expect((await sendAnnouncement(db(), a, { title: 'Happy Diwali from Blessly', body: 'New Diwali cards are here', link: '/cards', audience: 'country:IN' })).recipients).toBe(1);
    expect((await sendAnnouncement(db(), a, { title: 'Business update', body: 'Campaign stats improved', audience: 'business' })).recipients).toBe(1);
    const titles = async (id: string) => (await db().select().from(notifications).where(eq(notifications.userId, id))).map((n) => n.title);
    expect(await titles(india.id)).toEqual(['Happy Diwali from Blessly']);
    expect(await titles(uk.id)).toEqual([]);
    expect(await titles(owner.id)).toEqual(['Business update']);
    await expect(sendAnnouncement(db(), a, { title: 'x', body: 'yyy', audience: 'all' })).rejects.toThrow();
    await expect(sendAnnouncement(db(), a, { title: 'Hello', body: 'World', link: 'javascript:alert(1)', audience: 'all' })).rejects.toThrow(/Link/);
  });
});
