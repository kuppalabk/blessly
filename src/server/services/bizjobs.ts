import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { automations, bizMessages, businesses, campaigns, customers, waTemplates } from '../schema';
import { CloudApiProvider, OPTED_OUT, RATE_CAPPED, WhatsAppError, type WhatsAppProvider } from '../providers/whatsapp';
import { sendEmail, type EmailProvider } from '../providers/email';
import { isLeapYear, todayIn, toISO, type CalDate } from '@/lib/dates';
import { audienceIds, usableTemplate, usedThisMonth, waCreds, type Business } from './business';
import { businessAllowance } from './billing';

const BATCH = 100;
const MAX_BATCHES = 20;
const MAX_ATTEMPTS = 3;

type Customer = typeof customers.$inferSelect;
type Template = typeof waTemplates.$inferSelect;
type Plan = { channel: 'whatsapp' | 'email'; recipient: string; preview: string } | { skip: string };
type Content = { channel: string; template: Template | null; emailSubject: string; emailBody: string };

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const fill = (s: string, c: { name: string }, b: { name: string }) => s.replaceAll('{name}', firstName(c.name)).replaceAll('{business}', b.name);

/** Picks WhatsApp or email for one customer, honouring consent and opt-outs. */
export function chooseChannel(b: Business, c: Customer, content: Content): Plan {
  if (!c.consentAt) return { skip: 'No consent recorded' };
  const waOk = !!(b.waConnectedAt && b.waTokenEnc && content.template && usableTemplate(content.template) && c.phone && !c.waOptOutAt);
  const emailOk = !!(c.email && !c.emailOptOutAt && content.emailSubject && content.emailBody);
  if (content.channel !== 'email' && waOk) {
    const t = content.template!;
    return { channel: 'whatsapp', recipient: c.phone!, preview: t.body.replace(/\{\{\s*1\s*\}\}/g, firstName(c.name)).replace(/\{\{\s*2\s*\}\}/g, b.name).slice(0, 300) || t.name };
  }
  if (content.channel !== 'whatsapp' && emailOk) return { channel: 'email', recipient: c.email!, preview: fill(content.emailBody, c, b).slice(0, 300) };
  if (content.channel === 'whatsapp') return { skip: c.waOptOutAt ? 'Opted out of WhatsApp' : !c.phone ? 'No mobile number' : 'WhatsApp not connected or no approved template' };
  if (content.channel === 'email') return { skip: c.emailOptOutAt ? 'Opted out of email' : 'No email address' };
  return { skip: c.waOptOutAt && c.emailOptOutAt ? 'Unsubscribed' : 'No way to reach this customer' };
}

/** Birthdays on 29 February are celebrated on 28 February in other years. */
function matchesToday(m: number | null, d: number | null, today: CalDate) {
  if (m == null || d == null) return false;
  if (m === today.m && d === today.d) return true;
  return m === 2 && d === 29 && today.m === 2 && today.d === 28 && !isLeapYear(today.y);
}

/** Queues today's birthday and anniversary messages once the business's send hour has passed. One per customer per occasion. */
export async function planAutomations(db: DB, now: Date) {
  const rows = await db.select({ a: automations, b: businesses }).from(automations)
    .innerJoin(businesses, eq(businesses.id, automations.businessId)).where(and(eq(automations.enabled, true), isNull(businesses.pausedAt)));
  let queued = 0;
  for (const { a, b } of rows) {
    const today = todayIn(b.timezone, now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: b.timezone, hour: 'numeric', hourCycle: 'h23' }).format(now));
    if (hour < a.sendHour) continue;
    const mCol = a.kind === 'birthday' ? customers.birthdayMonth : customers.anniversaryMonth;
    const dCol = a.kind === 'birthday' ? customers.birthdayDay : customers.anniversaryDay;
    const candidates = await db.select().from(customers).where(and(eq(customers.businessId, b.id), eq(mCol, today.m), sql`${dCol} in (${today.d}, 29)`));
    const template = a.templateId ? (await db.query.waTemplates.findFirst({ where: eq(waTemplates.id, a.templateId) })) ?? null : null;
    const values = [];
    for (const c of candidates) {
      if (!matchesToday(a.kind === 'birthday' ? c.birthdayMonth : c.anniversaryMonth, a.kind === 'birthday' ? c.birthdayDay : c.anniversaryDay, today)) continue;
      const plan = chooseChannel(b, c, { channel: a.channel, template, emailSubject: a.emailSubject, emailBody: a.emailBody });
      const base = { businessId: b.id, customerId: c.id, dedupeKey: `${a.kind}:${c.id}:${toISO(today)}`, source: a.kind, sendAt: now };
      values.push('skip' in plan
        ? { ...base, channel: (c.phone ? 'whatsapp' : 'email') as 'whatsapp' | 'email', recipient: c.phone ?? c.email ?? '', status: 'skipped' as const, error: plan.skip }
        : { ...base, ...plan });
    }
    if (values.length) queued += (await db.insert(bizMessages).values(values).onConflictDoNothing().returning({ id: bizMessages.id })).length;
  }
  return queued;
}

/** Turns due campaigns into one queued message per customer. A campaign is expanded by exactly one runner. */
export async function expandCampaigns(db: DB, now: Date) {
  let queued = 0;
  for (let i = 0; i < 20; i++) {
    const claimed = await db.transaction(async (tx) => {
      const [c] = await tx.select({ c: campaigns }).from(campaigns).innerJoin(businesses, eq(businesses.id, campaigns.businessId))
        .where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.sendAt, now), isNull(businesses.pausedAt))).limit(1).for('update', { of: campaigns, skipLocked: true })
        .then((rows) => rows.map((r) => r.c));
      if (c) await tx.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, c.id));
      return c;
    });
    if (!claimed) break;
    const b = (await db.query.businesses.findFirst({ where: eq(businesses.id, claimed.businessId) }))!;
    const template = claimed.templateId ? (await db.query.waTemplates.findFirst({ where: eq(waTemplates.id, claimed.templateId) })) ?? null : null;
    const ids = await audienceIds(db, b.id, claimed.tag);
    for (let k = 0; k < ids.length; k += 500) {
      const cs = await db.select().from(customers).where(inArray(customers.id, ids.slice(k, k + 500)));
      const values = cs.map((c) => {
        const plan = chooseChannel(b, c, { channel: claimed.channel, template, emailSubject: claimed.emailSubject, emailBody: claimed.emailBody });
        const base = { businessId: b.id, customerId: c.id, campaignId: claimed.id, dedupeKey: `campaign:${claimed.id}:${c.id}`, source: 'campaign', sendAt: now };
        return 'skip' in plan
          ? { ...base, channel: (c.phone ? 'whatsapp' : 'email') as 'whatsapp' | 'email', recipient: c.phone ?? c.email ?? '', status: 'skipped' as const, error: plan.skip }
          : { ...base, ...plan };
      });
      if (values.length) queued += (await db.insert(bizMessages).values(values).onConflictDoNothing().returning({ id: bizMessages.id })).length;
    }
    await db.update(campaigns).set({ status: 'done', audience: ids.length }).where(eq(campaigns.id, claimed.id));
  }
  return queued;
}

/** Content for a queued message: the automation or campaign it came from. */
async function contentFor(db: DB, m: typeof bizMessages.$inferSelect): Promise<Content | null> {
  const src = m.source === 'campaign'
    ? m.campaignId ? await db.query.campaigns.findFirst({ where: eq(campaigns.id, m.campaignId) }) : null
    : await db.query.automations.findFirst({ where: and(eq(automations.businessId, m.businessId), eq(automations.kind, m.source)) });
  if (!src) return null;
  const template = src.templateId ? (await db.query.waTemplates.findFirst({ where: eq(waTemplates.id, src.templateId) })) ?? null : null;
  return { channel: src.channel, template, emailSubject: src.emailSubject, emailBody: src.emailBody };
}

export type BizSendResult = { sent: number; failed: number; skipped: number; retried: number };

/**
 * Sends queued messages. Rows are claimed with a lock and a 10-minute lease (attempts + 1) so overlapping
 * runners never send twice. Re-checks consent and the monthly allowance right before sending.
 */
export async function sendQueued(db: DB, wa: WhatsAppProvider, email: EmailProvider, now: Date, appUrl: string): Promise<BizSendResult> {
  const r: BizSendResult = { sent: 0, failed: 0, skipped: 0, retried: 0 };
  const used = new Map<string, number>();
  const quotas = new Map<string, { quota: number; source: string }>();
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.select().from(bizMessages).where(and(eq(bizMessages.status, 'queued'), lte(bizMessages.sendAt, now)))
        .orderBy(bizMessages.sendAt).limit(BATCH).for('update', { skipLocked: true });
      if (rows.length) await tx.update(bizMessages).set({ attempts: sql`${bizMessages.attempts} + 1`, sendAt: new Date(now.getTime() + 10 * 60000) }).where(inArray(bizMessages.id, rows.map((x) => x.id)));
      return rows;
    });
    if (!claimed.length) break;
    for (const m of claimed) {
      const done = (patch: Partial<typeof bizMessages.$inferInsert>) => db.update(bizMessages).set({ ...patch, updatedAt: now }).where(eq(bizMessages.id, m.id));
      const b = await db.query.businesses.findFirst({ where: eq(businesses.id, m.businessId) });
      const c = m.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, m.customerId) }) : null;
      const content = await contentFor(db, m);
      if (!b || !c || !content) { await done({ status: 'skipped', error: 'Customer or message was deleted' }); r.skipped++; continue; }
      if (b.pausedAt) { await done({ status: 'skipped', error: 'Business paused by Blessly' }); r.skipped++; continue; }
      if (!used.has(b.id)) used.set(b.id, await usedThisMonth(db, b.id, now));
      if (!quotas.has(b.id)) quotas.set(b.id, await businessAllowance(db, b, now));
      const q = quotas.get(b.id)!;
      if (used.get(b.id)! >= q.quota) {
        await done({ status: 'skipped', error: q.source === 'none' ? 'Free trial ended — choose the Business plan to keep sending' : 'Monthly message limit reached' });
        r.skipped++; continue;
      }
      // Opt-outs may have happened since the message was queued.
      const plan = chooseChannel(b, c, { ...content, channel: m.channel === 'email' && content.channel === 'both' ? 'email' : content.channel });
      if ('skip' in plan) { await done({ status: 'skipped', error: plan.skip }); r.skipped++; continue; }
      // Only the provider call is inside try: if recording the result fails afterwards, the message must not be sent again.
      let result: Partial<typeof bizMessages.$inferInsert>;
      try {
        if (plan.channel === 'whatsapp') {
          const t = content.template!;
          const params = [firstName(c.name), b.name].slice(0, t.paramCount);
          const { id } = await wa.sendTemplate(waCreds(b)!, { to: plan.recipient, template: t.name, language: t.language, params });
          result = { status: 'sent', channel: 'whatsapp', recipient: plan.recipient, providerId: id, sentAt: now, error: null, preview: plan.preview };
        } else {
          const unsub = `${appUrl}/u/${c.unsubscribeToken}`;
          await sendEmail(db, email, { to: plan.recipient, subject: fill(content.emailSubject, c, b), text: `${fill(content.emailBody, c, b)}\n\n— ${b.name}\n\nDon’t want these messages? ${unsub}` });
          result = { status: 'sent', channel: 'email', recipient: plan.recipient, sentAt: now, error: m.error?.startsWith('WhatsApp failed') ? m.error : null, preview: plan.preview };
        }
      } catch (e) {
        const err = e instanceof WhatsAppError ? e : new WhatsAppError((e as Error).message, null, true);
        if (err.optedOut) await db.update(customers).set({ waOptOutAt: now }).where(eq(customers.id, c.id));
        const fallback = plan.channel === 'whatsapp' && content.channel === 'both' && c.email && !c.emailOptOutAt && (!err.retryable || m.attempts + 1 >= MAX_ATTEMPTS);
        if (fallback) {
          await done({ status: 'queued', channel: 'email', recipient: c.email!, sendAt: now, attempts: 0, error: `WhatsApp failed: ${err.message}`.slice(0, 500), preview: fill(content.emailBody, c, b).slice(0, 300) });
          r.retried++;
        } else if (err.retryable && err.code !== RATE_CAPPED && m.attempts + 1 < MAX_ATTEMPTS) {
          await done({ status: 'queued', sendAt: new Date(now.getTime() + 5 * 60000 * (m.attempts + 1)), error: err.message.slice(0, 500) });
          r.retried++;
        } else {
          await done({ status: 'failed', error: (err.code ? `[${err.code}] ` : '') + err.message.slice(0, 480) });
          r.failed++;
        }
        continue;
      }
      try { await done(result); } catch (e) { console.error('[biz] sent but could not record', m.id, e); await done({ status: 'sent', sentAt: now, error: 'Sent; details could not be saved' }).catch(() => {}); }
      used.set(b.id, used.get(b.id)! + 1);
      r.sent++;
    }
  }
  return r;
}

/* ---------------- Webhook ---------------- */

const RANK = { queued: 0, skipped: 0, sent: 1, delivered: 2, read: 3, failed: 4 } as const;
const STOP = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|end|quit)\s*[.!]?\s*$/i;
const START = /^\s*(start|unstop|subscribe)\s*[.!]?\s*$/i;

type WebhookStatus = { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
type WebhookMessage = { from?: string; type?: string; text?: { body?: string }; button?: { text?: string } };
type WebhookPayload = { object?: string; entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; statuses?: WebhookStatus[]; messages?: WebhookMessage[] } }[] }[] };

/**
 * Handles Meta's webhook: delivery status updates (sent → delivered → read, or failed) and replies.
 * "STOP" from a customer opts them out of WhatsApp; "START" opts them back in. Safe to receive twice.
 */
export async function handleWebhook(db: DB, payload: WebhookPayload, now = new Date()) {
  let statuses = 0, optOuts = 0;
  if (payload.object !== 'whatsapp_business_account') return { statuses, optOuts };
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    if (change.field !== 'messages' || !change.value) continue;
    const phoneId = change.value.metadata?.phone_number_id;
    const b = phoneId ? await db.query.businesses.findFirst({ where: eq(businesses.waPhoneNumberId, phoneId) }) : null;
    if (!b) continue;
    for (const s of change.value.statuses ?? []) {
      if (!s.id || !s.status || !(s.status in RANK)) continue;
      const m = await db.query.bizMessages.findFirst({ where: and(eq(bizMessages.providerId, s.id), eq(bizMessages.businessId, b.id)) });
      if (!m) continue;
      const next = s.status as keyof typeof RANK;
      if (next === 'failed') {
        const e = s.errors?.[0];
        if (e?.code === OPTED_OUT && m.customerId) await db.update(customers).set({ waOptOutAt: now }).where(eq(customers.id, m.customerId));
        await db.update(bizMessages).set({ status: 'failed', error: `${e?.code ? `[${e.code}] ` : ''}${e?.title ?? e?.message ?? 'Not delivered'}${e?.error_data?.details ? ` — ${e.error_data.details}` : ''}`.slice(0, 500), updatedAt: now }).where(eq(bizMessages.id, m.id));
      } else if (RANK[next] > RANK[m.status] && m.status !== 'failed') {
        await db.update(bizMessages).set({ status: next, updatedAt: now }).where(eq(bizMessages.id, m.id));
      }
      statuses++;
    }
    for (const msg of change.value.messages ?? []) {
      const text = msg.text?.body ?? msg.button?.text ?? '';
      if (!msg.from) continue;
      if (STOP.test(text)) {
        const res = await db.update(customers).set({ waOptOutAt: now }).where(and(eq(customers.businessId, b.id), eq(customers.phone, msg.from))).returning({ id: customers.id });
        if (res.length) {
          optOuts++;
          await db.update(bizMessages).set({ status: 'skipped', error: 'Customer replied STOP', updatedAt: now })
            .where(and(inArray(bizMessages.customerId, res.map((x) => x.id)), eq(bizMessages.status, 'queued'), eq(bizMessages.channel, 'whatsapp')));
        }
      } else if (START.test(text)) {
        await db.update(customers).set({ waOptOutAt: null }).where(and(eq(customers.businessId, b.id), eq(customers.phone, msg.from)));
      }
    }
  }
  return { statuses, optOuts };
}

export async function runBusinessJobs(db: DB, email: EmailProvider, now: Date, appUrl: string, wa: WhatsAppProvider = new CloudApiProvider()) {
  const planned = await planAutomations(db, now);
  const fromCampaigns = await expandCampaigns(db, now);
  const sent = await sendQueued(db, wa, email, now, appUrl);
  return { bizQueued: planned + fromCampaigns, bizSent: sent.sent, bizFailed: sent.failed };
}
