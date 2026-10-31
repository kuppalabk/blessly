import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { createSession, deleteSession, logIn, signUp, userFromSession, updateSettings } from '@/server/services/auth';
import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from '@/server/services/people';
import { addSignature, cancelSend, draftWish, getPublicWishPage, getWish, publishWishPage, saveWish, scheduleSend } from '@/server/services/wishes';
import { runJobs } from '@/server/services/jobs';
import { listNotifications, markRead, unreadCount, upcoming } from '@/server/services/home';
import { OutboxOnlyProvider, type EmailProvider } from '@/server/providers/email';
import { notifications, outbox, reminders, scheduledSends } from '@/server/schema';
import { AppError } from '@/server/errors';

beforeEach(resetDb);
afterAll(closeDb);

const mailer = new OutboxOnlyProvider();
const nisha = { name: 'Nisha Kapoor', relationship: 'Best friend', phone: '98765 43210', language: 'en', occasions: [{ kind: 'birthday', month: 11, day: 12 }] };

describe('accounts and sessions', () => {
  it('signs up, logs in and resolves a session', async () => {
    const u = await signUp(db(), { name: 'Kiran', email: 'Kiran@Example.com', password: 'longpassword' });
    expect(u.email).toBe('kiran@example.com');
    await expect(logIn(db(), 'KIRAN@example.com', 'longpassword')).resolves.toMatchObject({ id: u.id });
    const { token } = await createSession(db(), u.id);
    expect((await userFromSession(db(), token))?.id).toBe(u.id);
    await deleteSession(db(), token);
    expect(await userFromSession(db(), token)).toBeNull();
  });

  it('rejects duplicate emails, short passwords and wrong passwords', async () => {
    await signUp(db(), { name: 'A', email: 'a@example.com', password: 'longpassword' });
    await expect(signUp(db(), { name: 'B', email: 'A@example.com', password: 'longpassword' })).rejects.toMatchObject({ status: 409 });
    await expect(signUp(db(), { name: 'C', email: 'c@example.com', password: 'short' })).rejects.toThrow(/8 characters/);
    await expect(logIn(db(), 'a@example.com', 'wrong-password')).rejects.toMatchObject({ status: 401 });
    await expect(logIn(db(), 'nobody@example.com', 'whatever123')).rejects.toMatchObject({ status: 401 });
  });

  it('expires sessions after 30 days', async () => {
    const u = await makeUser();
    const t0 = new Date('2026-10-26T00:00:00Z');
    const { token } = await createSession(db(), u.id, t0);
    expect(await userFromSession(db(), token, new Date('2026-11-20T00:00:00Z'))).not.toBeNull();
    expect(await userFromSession(db(), token, new Date('2026-11-26T00:00:01Z'))).toBeNull();
  });

  it('validates settings', async () => {
    const u = await makeUser();
    await expect(updateSettings(db(), u.id, { timezone: 'Nowhere/City' })).rejects.toThrow(/timezone/);
    expect((await updateSettings(db(), u.id, { timezone: 'Europe/London', country: 'gb', language: 'ta' })).country).toBe('GB');
  });
});

describe('people and occasions', () => {
  it('creates, lists by next occasion, updates and deletes people', async () => {
    const u = await makeUser();
    const now = new Date('2026-10-26T06:00:00Z');
    await createPerson(db(), u.id, nisha, u.timezone);
    await createPerson(db(), u.id, { name: 'Raj', relationship: 'Father', occasions: [{ kind: 'birthday', month: 3, day: 12 }] }, u.timezone);
    const list = await listPeople(db(), u.id, u.timezone, now);
    expect(list.map((p) => [p.name, p.nextOccasion?.daysAway])).toEqual([['Nisha Kapoor', 17], ['Raj', 137]]);
    const updated = await updatePerson(db(), u.id, list[0].id, { ...nisha, name: 'Nisha K', occasions: [...nisha.occasions, { kind: 'anniversary', month: 2, day: 29 }] }, u.timezone);
    expect(updated.name).toBe('Nisha K');
    expect(updated.occasions).toHaveLength(2);
    await deletePerson(db(), u.id, list[0].id, u.timezone);
    expect(await listPeople(db(), u.id, u.timezone)).toHaveLength(1);
  });

  it('keeps unchanged occasions when a person is edited', async () => {
    const u = await makeUser();
    const p = await createPerson(db(), u.id, nisha, u.timezone);
    const before = p.occasions[0].id;
    const after = await updatePerson(db(), u.id, p.id, { ...nisha, notes: 'loves trekking' }, u.timezone);
    expect(after.occasions[0].id).toBe(before);
  });

  it('rejects impossible dates and hides other users’ people', async () => {
    const u = await makeUser();
    const other = await makeUser();
    await expect(createPerson(db(), u.id, { ...nisha, occasions: [{ kind: 'birthday', month: 2, day: 30 }] }, u.timezone)).rejects.toThrow(/does not exist/);
    const p = await createPerson(db(), u.id, nisha, u.timezone);
    await expect(getPerson(db(), other.id, p.id, other.timezone)).rejects.toBeInstanceOf(AppError);
    await expect(deletePerson(db(), other.id, p.id, other.timezone)).rejects.toMatchObject({ status: 404 });
    await expect(getPerson(db(), u.id, 'not-a-uuid', u.timezone)).rejects.toMatchObject({ status: 404 });
  });

  it('builds the upcoming feed with people and festivals', async () => {
    const u = await makeUser();
    await createPerson(db(), u.id, nisha, u.timezone);
    const feed = await upcoming(db(), u, 60, new Date('2026-10-26T06:00:00Z'));
    expect(feed.map((i) => [i.title, i.daysAway])).toEqual([["Diwali", 13], ["Nisha Kapoor's birthday", 17], ['Christmas', 60]]);
  });
});

describe('wishes and wish pages', () => {
  it('drafts, saves, publishes and lets guests sign a wish page', async () => {
    const u = await makeUser();
    const p = await createPerson(db(), u.id, nisha, u.timezone);
    const draft = await draftWish({ occasion: 'birthday', language: 'hi', tone: 'heartfelt', recipientName: 'Nisha' }, null);
    expect(draft.source).toBe('template');
    const w = await saveWish(db(), u.id, { personId: p.id, occasion: 'birthday', language: 'hi', tone: 'heartfelt', text: draft.text, designIndex: 37, recipientName: 'Nisha', senderName: 'Kiran' });
    const page = await publishWishPage(db(), u.id, w.id);
    expect(page.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect((await publishWishPage(db(), u.id, w.id)).slug).toBe(page.slug);
    await addSignature(db(), page.slug, { name: 'Arjun', message: 'Happy 30th!' });
    const pub = await getPublicWishPage(db(), page.slug);
    expect(pub.wish.designIndex).toBe(37);
    expect(pub.signatures.map((s) => s.name)).toEqual(['Arjun']);
    expect((await getPublicWishPage(db(), page.slug)).page.views).toBe(1);
  });

  it('validates signatures and protects other users’ wishes', async () => {
    const u = await makeUser();
    const other = await makeUser();
    const w = await saveWish(db(), u.id, { occasion: 'diwali', language: 'en', tone: 'short', text: 'Happy Diwali!', recipientName: 'Anil', senderName: 'Kiran' });
    const page = await publishWishPage(db(), u.id, w.id);
    await expect(addSignature(db(), page.slug, { name: '', message: 'hi' })).rejects.toThrow(/name/);
    await expect(addSignature(db(), page.slug, { name: 'x', message: 'y'.repeat(501) })).rejects.toThrow();
    await expect(getWish(db(), other.id, w.id)).rejects.toMatchObject({ status: 404 });
    await expect(publishWishPage(db(), other.id, w.id)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicWishPage(db(), '../../etc')).rejects.toMatchObject({ status: 404 });
    await expect(saveWish(db(), u.id, { occasion: 'diwali', language: 'xx', tone: 'short', text: 'x', recipientName: 'a', senderName: 'b' })).rejects.toThrow();
  });
});

describe('scheduling and background jobs', () => {
  const now = new Date('2026-11-04T00:00:00Z');

  it('validates scheduled sends', async () => {
    const u = await makeUser();
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'short', text: 'Hi', recipientName: 'N', senderName: 'K' });
    await expect(scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: 'not-an-email', sendAt: '2026-11-12T03:30:00Z' }, 'IN', now)).rejects.toThrow(/email/);
    await expect(scheduleSend(db(), u.id, w.id, { channel: 'whatsapp', recipient: '12', sendAt: '2026-11-12T03:30:00Z' }, 'IN', now)).rejects.toThrow(/phone/);
    await expect(scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: 'n@example.com', sendAt: '2026-01-01T00:00:00Z' }, 'IN', now)).rejects.toThrow(/future/);
    const s = await scheduleSend(db(), u.id, w.id, { channel: 'whatsapp', recipient: '98765 43210', sendAt: '2026-11-12T03:30:00Z' }, 'IN', now);
    expect(s.recipient).toBe('919876543210');
    await cancelSend(db(), u.id, s.id);
    await expect(cancelSend(db(), u.id, s.id)).rejects.toMatchObject({ status: 404 });
  });

  it('plans reminders once, delivers them when due, and emails the user', async () => {
    const u = await makeUser();
    await createPerson(db(), u.id, nisha, u.timezone);
    const first = await runJobs(db(), mailer, now);
    expect(first.planned).toBe(4);
    expect(first.remindersDelivered).toBe(0);
    expect((await runJobs(db(), mailer, now)).planned).toBe(0); // idempotent
    const atGift = await runJobs(db(), mailer, new Date('2026-11-05T03:31:00Z'));
    expect(atGift.remindersDelivered).toBe(1);
    const notes = await listNotifications(db(), u.id);
    expect(notes[0].title).toBe("Nisha Kapoor's birthday in 7 days");
    expect(await unreadCount(db(), u.id)).toBe(1);
    await markRead(db(), u.id, 'all');
    expect(await unreadCount(db(), u.id)).toBe(0);
    const mails = await db().select().from(outbox);
    expect(mails.map((m) => [m.recipient, m.subject])).toEqual([[u.email, "Nisha Kapoor's birthday in 7 days"]]);
    await runJobs(db(), mailer, new Date('2026-11-12T03:31:00Z'));
    const states = await db().select({ s: reminders.stage, st: reminders.status }).from(reminders);
    expect(states.every((r) => r.st === 'delivered')).toBe(true);
  });

  it('sends scheduled emails and nudges the user for chat channels', async () => {
    const u = await makeUser();
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'short', text: 'Happy birthday, Nisha!', recipientName: 'Nisha', senderName: 'Kiran' });
    await publishWishPage(db(), u.id, w.id);
    await scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: 'Nisha@Example.com', sendAt: '2026-11-12T00:00:00Z' }, 'IN', now);
    await scheduleSend(db(), u.id, w.id, { channel: 'whatsapp', recipient: '9876543210', sendAt: '2026-11-12T00:00:00Z' }, 'IN', now);
    expect((await runJobs(db(), mailer, new Date('2026-11-11T23:59:00Z'))).emailsSent).toBe(0);
    const r = await runJobs(db(), mailer, new Date('2026-11-12T00:00:30Z'));
    expect(r).toMatchObject({ emailsSent: 1, chatNudges: 1 });
    const [mail] = await db().select().from(outbox);
    expect(mail.recipient).toBe('nisha@example.com');
    expect(mail.body).toContain('/w/');
    const n = await db().select().from(notifications).where(eq(notifications.userId, u.id));
    expect(n[0].title).toBe('Time to send your wish to Nisha');
    expect((await runJobs(db(), mailer, new Date('2026-11-12T00:05:00Z'))).emailsSent).toBe(0); // not re-sent
  });

  it('retries failed emails with backoff and gives up after three attempts', async () => {
    const u = await makeUser();
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'short', text: 'Hi', recipientName: 'Nisha', senderName: 'Kiran' });
    await scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: 'n@example.com', sendAt: '2026-11-12T00:00:00Z' }, 'IN', now);
    const broken: EmailProvider = { name: 'broken', send: vi.fn().mockRejectedValue(new Error('provider down')) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let t = new Date('2026-11-12T00:00:00Z');
    for (let i = 0; i < 3; i++) {
      await runJobs(db(), broken, t);
      t = new Date(t.getTime() + 60 * 60000);
    }
    const [s] = await db().select().from(scheduledSends);
    expect(s).toMatchObject({ status: 'failed', attempts: 3, lastError: 'provider down' });
    const titles = (await listNotifications(db(), u.id)).map((x) => x.title);
    expect(titles).toContain("We couldn't send your wish to Nisha");
    warn.mockRestore();
  });

  it('never double-sends a scheduled email when runners overlap', async () => {
    const u = await makeUser();
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'short', text: 'Hi', recipientName: 'Nisha', senderName: 'Kiran' });
    for (let i = 0; i < 5; i++) await scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: `n${i}@example.com`, sendAt: '2026-11-12T00:00:00Z' }, 'IN', now);
    const slow: EmailProvider = { name: 'slow', send: () => new Promise((r) => setTimeout(() => r({ id: 'x' }), 30)) };
    const t = new Date('2026-11-12T00:01:00Z');
    const results = await Promise.all([runJobs(db(), slow, t), runJobs(db(), slow, t), runJobs(db(), slow, t)]);
    expect(results.reduce((a, r) => a + r.emailsSent, 0)).toBe(5);
    expect(await db().select().from(outbox)).toHaveLength(5);
  });

  it('never double-delivers when two job runners overlap', async () => {
    const u = await makeUser();
    await createPerson(db(), u.id, { ...nisha, occasions: [{ kind: 'birthday', month: 11, day: 12 }] }, u.timezone);
    await runJobs(db(), mailer, now);
    const due = new Date('2026-11-12T04:00:00Z');
    const [a, b] = await Promise.all([runJobs(db(), mailer, due), runJobs(db(), mailer, due)]);
    expect(a.remindersDelivered + b.remindersDelivered).toBe(4);
    expect((await listNotifications(db(), u.id)).length).toBe(4);
  });
});
