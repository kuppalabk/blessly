import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DB } from '../db';
import { notifications } from '../schema';
import { listPeople } from './people';
import { familyEventsBetween } from './family';
import { festivalExtras } from './content';
import { addDays, daysBetween, fromISO, toISO, todayIn, type CalDate } from '@/lib/dates';
import { festivalsBetween } from '@/lib/festivals';
import type { OccasionId } from '@/lib/i18n-data';

export type UpcomingItem = {
  key: string;
  type: 'person' | 'festival' | 'event';
  /** Where tapping the item goes. */
  href: string;
  title: string;
  subtitle: string;
  date: CalDate;
  daysAway: number;
  occasion: OccasionId | null;
  personId?: string;
  approximate?: boolean;
};

const PERSON_OCCASION: Record<string, OccasionId> = { birthday: 'birthday', anniversary: 'anniversary', work_anniversary: 'newjob', custom: 'birthday' };

export async function upcoming(db: DB, user: { id: string; timezone: string; country: string }, days = 60, now = new Date()): Promise<UpcomingItem[]> {
  const today = todayIn(user.timezone, now);
  const end = addDays(today, days);
  const items: UpcomingItem[] = [];
  for (const p of await listPeople(db, user.id, user.timezone, now)) {
    for (const o of p.occasions) {
      if (o.daysAway > days) continue;
      items.push({
        key: `o-${o.id}`, type: 'person', personId: p.id, href: `/people/${p.id}`,
        title: o.kind === 'birthday' ? `${p.name}'s birthday` : o.kind === 'anniversary' ? `${p.name}'s anniversary` : `${p.name} · ${o.label}`,
        subtitle: p.isMine ? p.relationship : `${p.relationship} · shared by ${p.ownerName ?? 'family'}`, date: o.next, daysAway: o.daysAway, occasion: PERSON_OCCASION[o.kind] ?? 'birthday'
      });
    }
  }
  for (const f of festivalsBetween(today, end, user.country, await festivalExtras(db))) {
    items.push({ key: `f-${f.festival.id}-${f.date.y}`, type: 'festival', href: `/create?occasion=${f.festival.occasion}`, title: f.festival.name, subtitle: 'Festival', date: f.date, daysAway: daysBetween(today, f.date), occasion: f.festival.occasion, approximate: f.festival.approximate });
  }
  for (const { e, familyName } of await familyEventsBetween(db, user.id, toISO(today), toISO(end))) {
    const date = fromISO(e.eventDate);
    items.push({
      key: `e-${e.id}`, type: 'event', href: `/family/events/${e.id}`, title: e.title,
      subtitle: `${familyName}${e.eventTime ? ` · ${e.eventTime}` : ''}`, date, daysAway: daysBetween(today, date), occasion: e.occasion as OccasionId,
      personId: e.personId ?? undefined
    });
  }
  return items.sort((a, b) => a.daysAway - b.daysAway || a.title.localeCompare(b.title));
}

export async function listNotifications(db: DB, userId: string, limit = 30) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(db: DB, userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return n;
}

export async function markRead(db: DB, userId: string, ids: string[] | 'all', now = new Date()) {
  const where = ids === 'all'
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : and(eq(notifications.userId, userId), inArray(notifications.id, ids.slice(0, 100)));
  await db.update(notifications).set({ readAt: now }).where(where);
}
