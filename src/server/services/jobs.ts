import { loadSettings } from '../settings';
import { moneyJobs } from './money';
import { celebrationJobs } from './celebrations';
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { eventAlerts, jobRuns, rateLimits, familyEvents, familyMembers, notifications, occasions, people, reminders, scheduledSends, users, wishes, wishPages } from '../schema';
import { planReminders, reminderCopy, type Stage } from '@/lib/reminders';
import { addDays, daysBetween, fromISO, toISO, todayIn, zonedTime } from '@/lib/dates';
import { occasionLabel } from './people';
import { reminderRecipients } from './family';
import { pushPendingNotifications } from './push';
import { sendEmail, type EmailProvider } from '../providers/email';
import { pushProviderFromEnv, type PushProvider } from '../providers/push';
import { CloudApiProvider, type WhatsAppProvider } from '../providers/whatsapp';
import { runBusinessJobs } from './bizjobs';

const BATCH = 200;
const MAX_ATTEMPTS = 3;

export type JobResult = { planned: number; remindersDelivered: number; emailsSent: number; chatNudges: number; eventAlerts: number; pushed: number; bizQueued: number; bizSent: number; rsvpReminders: number; giftCardsDelivered: number; printUpdates: number; failures: number };

/**
 * Creates reminder rows for occasions in the next two weeks, one set per person who should hear about it:
 * the owner, plus every opted-in member of the family circle the person is shared with (in their own timezone).
 * Safe to run repeatedly.
 */
export async function planAllReminders(db: DB, now: Date) {
  const rows = await db.select({ o: occasions, tz: users.timezone, familyId: people.familyId }).from(occasions)
    .innerJoin(users, eq(users.id, occasions.userId))
    .innerJoin(people, eq(people.id, occasions.personId));
  const familyIds = [...new Set(rows.map((r) => r.familyId).filter((x): x is string => !!x))];
  const members = await reminderRecipients(db, familyIds);
  let planned = 0;
  for (const { o, tz, familyId } of rows) {
    const recipients = new Map<string, string>([[o.userId, tz]]);
    if (familyId) for (const m of members) if (m.familyId === familyId && !recipients.has(m.userId)) recipients.set(m.userId, m.timezone);
    const values = [];
    for (const [userId, timezone] of recipients) {
      for (const p of planReminders(o, timezone, now)) values.push({ userId, occasionId: o.id, stage: p.stage, eventDate: toISO(p.eventDate), dueAt: p.dueAt });
    }
    if (!values.length) continue;
    const res = await db.insert(reminders).values(values).onConflictDoNothing().returning({ id: reminders.id });
    planned += res.length;
  }
  return planned;
}

/**
 * Family event alerts for every member: the evening before (18:00) and the morning of (09:00), in each member's timezone.
 * A unique row per member and stage means each alert is sent once, however many runners overlap.
 */
export async function deliverEventAlerts(db: DB, now: Date) {
  const from = toISO(addDays(todayIn('UTC', now), -1));
  const to = toISO(addDays(todayIn('UTC', now), 2));
  const evs = await db.select().from(familyEvents).where(and(gte(familyEvents.eventDate, from), lte(familyEvents.eventDate, to)));
  if (!evs.length) return 0;
  const members = await db.select({ familyId: familyMembers.familyId, userId: familyMembers.userId, timezone: users.timezone })
    .from(familyMembers).innerJoin(users, eq(users.id, familyMembers.userId))
    .where(inArray(familyMembers.familyId, [...new Set(evs.map((e) => e.familyId))]));
  let sent = 0;
  for (const e of evs) {
    const date = fromISO(e.eventDate);
    for (const m of members.filter((x) => x.familyId === e.familyId)) {
      const today = todayIn(m.timezone, now);
      const diff = daysBetween(today, date);
      let stage: 'eve' | 'day' | null = null;
      if (diff === 0 && now >= zonedTime(date, 9, 0, m.timezone)) stage = 'day';
      else if (diff === 1 && now >= zonedTime(addDays(date, -1), 18, 0, m.timezone)) stage = 'eve';
      if (!stage) continue;
      await db.transaction(async (tx) => {
        const [claimed] = await tx.insert(eventAlerts).values({ eventId: e.id, userId: m.userId, stage }).onConflictDoNothing().returning();
        if (!claimed) return;
        const when = e.eventTime ? ` at ${e.eventTime}` : '';
        await tx.insert(notifications).values({
          userId: m.userId,
          title: stage === 'day' ? `Today: ${e.title}` : `Tomorrow: ${e.title}`,
          body: `${e.place ? `${e.place}${when}` : when ? `Starts${when}` : 'Your family event'}. Check RSVPs and who’s doing what.`,
          link: `/family/events/${e.id}`,
          createdAt: now
        });
        sent++;
      });
    }
  }
  return sent;
}

/** Delivers due reminders as in-app notifications plus an email to the user. Uses row locks so parallel runners never double-send. */
export async function deliverDueReminders(db: DB, email: EmailProvider, now: Date, appUrl: string) {
  let delivered = 0, failures = 0;
  const due = await db.transaction(async (tx) => {
    const rows = await tx.select({ r: reminders, o: occasions, p: people, u: users }).from(reminders)
      .innerJoin(occasions, eq(occasions.id, reminders.occasionId))
      .innerJoin(people, eq(people.id, occasions.personId))
      .innerJoin(users, eq(users.id, reminders.userId))
      .where(and(eq(reminders.status, 'pending'), lte(reminders.dueAt, now)))
      .limit(BATCH).for('update', { of: reminders, skipLocked: true });
    for (const { r, o, p, u } of rows) {
      const daysAway = Math.max(0, daysBetween(todayIn(u.timezone, now), fromISO(r.eventDate)));
      const copy = reminderCopy(r.stage as Stage, p.name, occasionLabel(o.kind, o.label), daysAway);
      const link = `/people/${p.id}`;
      await tx.insert(notifications).values({ userId: u.id, title: copy.title, body: copy.body, link, createdAt: now });
      await tx.update(reminders).set({ status: 'delivered', deliveredAt: now }).where(eq(reminders.id, r.id));
    }
    return rows;
  });
  for (const { o, p, u, r } of due) {
    delivered++;
    const daysAway = Math.max(0, daysBetween(todayIn(u.timezone, now), fromISO(r.eventDate)));
    const copy = reminderCopy(r.stage as Stage, p.name, occasionLabel(o.kind, o.label), daysAway);
    try {
      await sendEmail(db, email, { to: u.email, subject: copy.title, text: `${copy.body}\n\nOpen Blessly: ${appUrl}/people/${p.id}` });
    } catch (e) {
      failures++;
      console.warn('[jobs] reminder email failed', (e as Error).message);
    }
  }
  return { delivered, failures };
}

/** Processes scheduled sends: emails go out; chat channels become a "send now" nudge to the user. */
export async function processDueSends(db: DB, email: EmailProvider, now: Date, appUrl: string) {
  let emailsSent = 0, chatNudges = 0, failures = 0;
  const due = await db.transaction(async (tx) => {
    const rows = await tx.select({ s: scheduledSends, w: wishes, u: users }).from(scheduledSends)
      .innerJoin(wishes, eq(wishes.id, scheduledSends.wishId))
      .innerJoin(users, eq(users.id, scheduledSends.userId))
      .where(and(eq(scheduledSends.status, 'scheduled'), lte(scheduledSends.sendAt, now)))
      .limit(BATCH).for('update', { of: scheduledSends, skipLocked: true });
    // Claim the rows with a 10-minute lease so a concurrent runner skips them even after this transaction ends.
    const lease = new Date(now.getTime() + 10 * 60000);
    for (const { s } of rows) await tx.update(scheduledSends).set({ attempts: sql`${scheduledSends.attempts} + 1`, sendAt: lease }).where(eq(scheduledSends.id, s.id));
    return rows;
  });
  for (const { s, w, u } of due) {
    const page = await db.query.wishPages.findFirst({ where: eq(wishPages.wishId, w.id) });
    const pageUrl = page ? `${appUrl}/w/${page.slug}` : null;
    try {
      if (s.channel === 'email') {
        await sendEmail(db, email, { to: s.recipient, subject: `A wish for you from ${w.senderName}`, text: `${w.text}${pageUrl ? `\n\nSee your card: ${pageUrl}` : ''}` });
        await db.update(scheduledSends).set({ status: 'sent', sentAt: now, lastError: null }).where(eq(scheduledSends.id, s.id));
        emailsSent++;
      } else {
        await db.insert(notifications).values({ userId: u.id, title: `Time to send your wish to ${w.recipientName}`, body: 'Your message is ready — tap to open it in the app.', link: `/wishes/${w.id}`, createdAt: now });
        await db.update(scheduledSends).set({ status: 'notified', sentAt: now, lastError: null }).where(eq(scheduledSends.id, s.id));
        chatNudges++;
      }
    } catch (e) {
      failures++;
      const attempts = s.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.update(scheduledSends).set({
        status: failed ? 'failed' : 'scheduled',
        lastError: (e as Error).message.slice(0, 500),
        sendAt: failed ? s.sendAt : new Date(now.getTime() + 5 * 60000 * attempts)
      }).where(eq(scheduledSends.id, s.id));
      if (failed) await db.insert(notifications).values({ userId: u.id, title: `We couldn't send your wish to ${w.recipientName}`, body: 'Open the wish to send it another way.', link: `/wishes/${w.id}`, createdAt: now });
    }
  }
  return { emailsSent, chatNudges, failures };
}

export async function runJobs(
  db: DB, email: EmailProvider, now = new Date(), appUrl = process.env.APP_URL ?? 'http://localhost:3000',
  push: PushProvider | null = pushProviderFromEnv(), wa: WhatsAppProvider = new CloudApiProvider()
): Promise<JobResult> {
  await loadSettings(true);
  const planned = await planAllReminders(db, now);
  const r = await deliverDueReminders(db, email, now, appUrl);
  const s = await processDueSends(db, email, now, appUrl);
  const ev = await deliverEventAlerts(db, now);
  // Business messages (WhatsApp / email to customers). Kept separate so a problem there never blocks personal reminders.
  let biz = { bizQueued: 0, bizSent: 0, bizFailed: 0 };
  try { biz = await runBusinessJobs(db, email, now, appUrl, wa); } catch (e) { console.error('[jobs] business messages failed', e); biz.bizFailed++; }
  let cel = { reminders: 0, dayBefore: 0 }, celFailed = 0;
  try { cel = await celebrationJobs(db, email, now, appUrl); } catch (e) { console.error('[jobs] celebration reminders failed', e); celFailed = 1; }
  let money = { giftCards: 0, prints: 0 };
  try { money = await moneyJobs(db, { email, appUrl }, now); } catch (e) { console.error('[jobs] money jobs failed', e); celFailed++; }
  // Last, so alerts created in this run reach phones straight away.
  const p = await pushPendingNotifications(db, push, now);
  return { planned, remindersDelivered: r.delivered, emailsSent: s.emailsSent, chatNudges: s.chatNudges, eventAlerts: ev, pushed: p.pushed, bizQueued: biz.bizQueued, bizSent: biz.bizSent, rsvpReminders: cel.reminders + cel.dayBefore, giftCardsDelivered: money.giftCards, printUpdates: money.prints, failures: r.failures + s.failures + p.pushFailures + biz.bizFailed + celFailed };
}

/** Runs the jobs and records the run (for the admin health page). Keeps 7 days of history. */
export async function runJobsRecorded(db: DB, email: EmailProvider, now = new Date()) {
  const [run] = await db.insert(jobRuns).values({ startedAt: now }).returning();
  try {
    const result = await runJobs(db, email, now);
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: result.failures === 0, result: JSON.stringify(result) }).where(eq(jobRuns.id, run.id));
    if (Math.random() < 0.05) {
      await db.delete(jobRuns).where(lt(jobRuns.startedAt, new Date(now.getTime() - 7 * 86400000)));
      await db.delete(rateLimits).where(lt(rateLimits.resetAt, now));
    }
    return result;
  } catch (e) {
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, error: String((e as Error).message ?? e).slice(0, 1000) }).where(eq(jobRuns.id, run.id));
    throw e;
  }
}
