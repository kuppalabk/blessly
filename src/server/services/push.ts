import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { notifications, pushSubscriptions } from '../schema';
import type { PushPayload, PushProvider } from '../providers/push';

const MAX_FAILURES = 5;
const MAX_SUBSCRIPTIONS_PER_USER = 10;
/** Alerts older than this are never pushed (e.g. after downtime) — they stay in the in-app inbox. */
const PUSH_WINDOW_MS = 60 * 60000;

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Push endpoint must be https'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) })
});

/** Saves (or moves to this user) a browser's push subscription. */
export async function subscribe(db: DB, userId: string, raw: unknown, userAgent: string | null) {
  const s = subscriptionSchema.parse(raw);
  const [row] = await db.insert(pushSubscriptions)
    .values({ userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth, failures: 0, userAgent: userAgent?.slice(0, 200) ?? null } })
    .returning();
  // Keep the newest few devices per person.
  const all = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(sql`${pushSubscriptions.createdAt} desc`);
  const extra = all.slice(MAX_SUBSCRIPTIONS_PER_USER).map((r) => r.id);
  if (extra.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, extra));
  return row;
}

export async function unsubscribe(db: DB, userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function deviceCount(db: DB, userId: string) {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}

/** Sends to every device the user has. Removes subscriptions the browser has dropped. */
export async function pushToUser(db: DB, push: PushProvider, userId: string, payload: PushPayload) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0, failed = 0;
  for (const s of subs) {
    const r = await push.send(s, payload);
    if (r.ok) {
      sent++;
      if (s.failures) await db.update(pushSubscriptions).set({ failures: 0 }).where(eq(pushSubscriptions.id, s.id));
    } else {
      failed++;
      if (r.gone || s.failures + 1 >= MAX_FAILURES) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else await db.update(pushSubscriptions).set({ failures: s.failures + 1 }).where(eq(pushSubscriptions.id, s.id));
    }
  }
  return { sent, failed, devices: subs.length };
}

/**
 * Pushes new in-app alerts to the user's devices. Each alert is claimed with a row lock and marked
 * `pushed_at` first, so overlapping runners never push the same alert twice.
 */
export async function pushPendingNotifications(db: DB, push: PushProvider | null, now: Date) {
  const cutoff = new Date(now.getTime() - PUSH_WINDOW_MS);
  // Too old, or push not configured: mark as handled without sending.
  await db.update(notifications).set({ pushedAt: now }).where(and(isNull(notifications.pushedAt), push ? lt(notifications.createdAt, cutoff) : sql`true`));
  if (!push) return { pushed: 0, pushFailures: 0 };
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.select().from(notifications)
      .where(and(isNull(notifications.pushedAt), gte(notifications.createdAt, cutoff)))
      .limit(500).for('update', { skipLocked: true });
    if (rows.length) await tx.update(notifications).set({ pushedAt: now }).where(inArray(notifications.id, rows.map((r) => r.id)));
    return rows;
  });
  let pushed = 0, pushFailures = 0;
  for (const n of claimed) {
    try {
      const r = await pushToUser(db, push, n.userId, { title: n.title, body: n.body, url: n.link ?? '/notifications', tag: n.id });
      pushed += r.sent;
      pushFailures += r.failed;
    } catch (e) {
      pushFailures++;
      console.warn('[push] failed', (e as Error).message);
    }
  }
  return { pushed, pushFailures };
}
