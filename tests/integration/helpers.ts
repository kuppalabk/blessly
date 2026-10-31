import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { signUp } from '@/server/services/auth';

export const db = () => getDb();

export async function resetDb() {
  (await import('@/server/services/content')).clearContentCache();
  await db().execute(sql`TRUNCATE users, sessions, people, occasions, reminders, wishes, wish_pages, signatures, scheduled_sends, notifications, outbox, families, family_members, family_invites, family_events, event_rsvps, family_tasks, event_alerts, push_subscriptions, businesses, customers, wa_templates, automations, campaigns, biz_messages, admin_audit, password_resets, job_runs, albums, album_photos, subscriptions, provider_prices, billing_events, business_members, business_invites, festival_dates, card_overrides, announcements, rate_limits, app_settings, files, card_drafts, celebrations, celebration_guests, celebration_posts, celebration_updates, wishlists, wishlist_items, wishlist_reservations, user_identities, auth_challenges, payments, ledger_entries, payouts, partners, collections, contributions, products, community_designs, orders, gift_cards, promo_codes, promo_redemptions, affiliates, affiliate_referrals, affiliate_commissions RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(overrides: Record<string, unknown> = {}) {
  n++;
  return signUp(db(), { name: `User ${n}`, email: `user${n}-${Date.now()}@example.com`, password: 'correct horse', timezone: 'Asia/Kolkata', country: 'IN', ...overrides });
}

/** Gives a user a paid plan (as if they had paid) until 2099. */
export async function givePlan(userId: string, planId: 'family' | 'business') {
  const { subscriptions } = await import('@/server/schema');
  await db().insert(subscriptions).values({ userId, planId, interval: 'month', currency: 'INR', amount: 0, provider: 'manual', status: 'active', currentPeriodEnd: new Date('2099-01-01') });
}
