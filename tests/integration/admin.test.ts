import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { createSession, logIn, userFromSession } from '@/server/services/auth';
import {
  adminDeleteUser, assertAdmin, auditLog, listBusinesses, listUsers, logoutEverywhere, pauseBusiness, platformStats, resumeBusiness,
  setQuota, suspendUser, systemHealth, unsuspendUser, userDetail, startSupportView, endSupportView
} from '@/server/services/admin';
import { deleteOwnAccount, deleteUserEverywhere, exportUserData, requestPasswordReset, resetPassword } from '@/server/services/account';
import { acceptInvite, createEvent, createFamily, createInvite, getFamily, listFamilies } from '@/server/services/family';
import { createPerson } from '@/server/services/people';
import { saveWish, scheduleSend } from '@/server/services/wishes';
import { createBusiness, createCustomer, getMyBusiness, updateAutomation } from '@/server/services/business';
import { runJobs, runJobsRecorded } from '@/server/services/jobs';
import { OutboxOnlyProvider } from '@/server/providers/email';
import { bizMessages, businesses, families, jobRuns, outbox, scheduledSends, sessions, users } from '@/server/schema';

beforeEach(resetDb);
afterAll(closeDb);

const mailer = new OutboxOnlyProvider();
const NOW = new Date('2026-11-12T04:00:00Z');

async function makeAdmin() {
  const a = await makeUser({ name: 'Ada Admin' });
  await db().update(users).set({ role: 'admin' }).where(eq(users.id, a.id));
  return { ...a, role: 'admin' };
}

describe('admin access', () => {
  it('hides the admin area from everyone else', () => {
    expect(() => assertAdmin(null)).toThrow(/Not found/);
    expect(() => assertAdmin({ role: 'user' })).toThrow(/Not found/);
    expect(() => assertAdmin({ role: 'admin' })).not.toThrow();
  });

  it('shows platform numbers and a 14-day sign-up chart', async () => {
    await makeAdmin();
    const u = await makeUser();
    await createFamily(db(), u.id, { name: 'F' });
    await createBusiness(db(), u.id, { name: 'B' });
    const s = await platformStats(db(), new Date());
    expect(s).toMatchObject({ usersTotal: 2, new7: 2, familiesTotal: 1, businessesTotal: 1, suspended: 0 });
    expect(s.signups).toHaveLength(14);
    expect(s.signups.at(-1)!.n).toBe(2);
  });
});

describe('managing users', () => {
  it('searches and filters users', async () => {
    await makeAdmin();
    await makeUser({ name: 'Nisha Kapoor', email: 'nisha@example.com' });
    const owner = await makeUser({ name: 'Shop Owner' });
    await createBusiness(db(), owner.id, { name: 'Shop' });
    expect((await listUsers(db(), { q: 'nisha' })).users.map((u) => u.email)).toEqual(['nisha@example.com']);
    expect((await listUsers(db(), { filter: 'admins' })).total).toBe(1);
    expect((await listUsers(db(), { filter: 'business' })).users.map((u) => u.name)).toEqual(['Shop Owner']);
    expect((await listUsers(db(), { q: '%' })).total).toBe(0);
  });

  it('suspends: ends sessions, blocks login, cancels sends and pauses their business; unsuspend restores it', async () => {
    const admin = await makeAdmin();
    const u = await makeUser({ email: 'sus@example.com', password: 'correct horse' });
    const { token } = await createSession(db(), u.id);
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'short', text: 'Hi', recipientName: 'A', senderName: 'B' });
    await scheduleSend(db(), u.id, w.id, { channel: 'email', recipient: 'a@example.com', sendAt: new Date(Date.now() + 3600000) });
    await createBusiness(db(), u.id, { name: 'Shop' });
    await expect(suspendUser(db(), admin, u.id, { reason: '' })).rejects.toThrow(/reason/);
    await suspendUser(db(), admin, u.id, { reason: 'Spam complaints' });
    expect(await userFromSession(db(), token)).toBeNull();
    await expect(logIn(db(), 'sus@example.com', 'correct horse')).rejects.toMatchObject({ status: 403, code: 'suspended' });
    await expect(logIn(db(), 'sus@example.com', 'wrong')).rejects.toMatchObject({ status: 401 }); // no hint without the password
    expect((await db().select().from(scheduledSends))[0].status).toBe('cancelled');
    expect((await getMyBusiness(db(), u.id))?.pausedReason).toBe('Owner suspended: Spam complaints');
    await unsuspendUser(db(), admin, u.id);
    await expect(logIn(db(), 'sus@example.com', 'correct horse')).resolves.toMatchObject({ id: u.id });
    expect((await getMyBusiness(db(), u.id))?.pausedAt).toBeNull();
    expect((await auditLog(db())).map((a) => [a.action, a.targetLabel, a.adminEmail])).toEqual([
      ['user.unsuspend', 'sus@example.com', admin.email], ['user.suspend', 'sus@example.com', admin.email]
    ]);
    expect((await userDetail(db(), u.id)).history).toHaveLength(2);
  });

  it('protects admins and the admin’s own account', async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    await expect(suspendUser(db(), admin, admin.id, { reason: 'test it' })).rejects.toThrow(/your own account/);
    await expect(suspendUser(db(), admin, other.id, { reason: 'test it' })).rejects.toMatchObject({ status: 403 });
    await expect(suspendUser(db(), admin, 'not-a-uuid', { reason: 'test it' })).rejects.toMatchObject({ status: 404 });
  });

  it('logs a user out everywhere', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await createSession(db(), u.id);
    await createSession(db(), u.id);
    expect(await logoutEverywhere(db(), admin, u.id)).toBe(2);
    expect(await db().select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
  });

  it('shows a user’s details without the password hash', async () => {
    const u = await makeUser();
    await createPerson(db(), u.id, { name: 'P', relationship: 'Friend' }, 'UTC');
    const d = await userDetail(db(), u.id);
    expect(d.counts.people).toBe(1);
    expect(JSON.stringify(d)).not.toContain('passwordHash');
  });

  it('deletes a user only when the email is typed exactly', async () => {
    const admin = await makeAdmin();
    const u = await makeUser({ email: 'gone@example.com' });
    await expect(adminDeleteUser(db(), admin, u.id, { confirmEmail: 'gone@example', reason: 'GDPR request' })).rejects.toThrow(/exactly/);
    await adminDeleteUser(db(), admin, u.id, { confirmEmail: 'GONE@example.com', reason: 'GDPR request by email' });
    expect(await db().query.users.findFirst({ where: eq(users.id, u.id) })).toBeUndefined();
    expect((await auditLog(db()))[0]).toMatchObject({ action: 'user.delete', targetLabel: 'gone@example.com', details: 'GDPR request by email' });
  });
});

describe('support view', () => {
  it('needs a reason, is audited, tells the user, expires, and ends when the admin loses admin rights', async () => {
    const admin = await makeAdmin();
    const u = await makeUser({ name: 'Rita' });
    await expect(startSupportView(db(), admin, u.id, { reason: '' })).rejects.toThrow(/reason/);
    await expect(startSupportView(db(), admin, admin.id, { reason: 'testing it' })).rejects.toThrow(/your own account/);
    const { token } = await startSupportView(db(), admin, u.id, { reason: 'Reminders not arriving' }, NOW);
    const seen = await userFromSession(db(), token, new Date(NOW.getTime() + 60000));
    expect(seen).toMatchObject({ id: u.id, viewedBy: admin.email });
    expect((await db().query.users.findFirst({ where: eq(users.id, u.id) }))?.lastSeenAt?.getTime()).not.toBe(NOW.getTime() + 60000);
    expect(await userFromSession(db(), token, new Date(NOW.getTime() + 31 * 60000))).toBeNull(); // 30 minutes
    const note = await db().query.notifications.findFirst({ where: (n, { eq: q }) => q(n.userId, u.id) });
    expect(note?.title).toBe('Blessly support viewed your account');
    expect((await auditLog(db()))[0]).toMatchObject({ action: 'user.support_view', details: 'Reminders not arriving' });
    await db().update(users).set({ role: 'user' }).where(eq(users.id, admin.id));
    expect(await userFromSession(db(), token, new Date(NOW.getTime() + 60000))).toBeNull();
    await endSupportView(db(), token);
    // endSupportView never deletes a normal session.
    const { token: normal } = await createSession(db(), u.id);
    await endSupportView(db(), normal);
    expect(await userFromSession(db(), normal)).toMatchObject({ id: u.id });
  });
});

describe('managing businesses', () => {
  it('changes the allowance and pauses/resumes sending, telling the owner', async () => {
    const admin = await makeAdmin();
    const owner = await makeUser();
    const b = await createBusiness(db(), owner.id, { name: 'Sweet Treats', timezone: 'Asia/Kolkata' });
    await updateAutomation(db(), b, 'birthday', { enabled: true, channel: 'email', templateId: null, emailSubject: 'Happy birthday {name}', emailBody: 'From {business}', sendHour: 9 });
    await createCustomer(db(), b, { name: 'Nisha', email: 'n@example.com', birthdayMonth: 11, birthdayDay: 12, consent: true });
    await setQuota(db(), admin, b.id, { quota: 5000 });
    await pauseBusiness(db(), admin, b.id, { reason: 'Customer complaints' });
    expect((await runJobs(db(), mailer, NOW, 'https://x', null)).bizQueued).toBe(0);
    const list = await listBusinesses(db(), {}, NOW);
    expect(list[0]).toMatchObject({ name: 'Sweet Treats', quota: 5000, pausedReason: 'Customer complaints', customers: 1 });
    await resumeBusiness(db(), admin, b.id);
    expect((await runJobs(db(), mailer, NOW, 'https://x', null)).bizSent).toBe(1);
    const titles = (await db().query.notifications.findMany({ where: (n, { eq: q }) => q(n.userId, owner.id) })).map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['Your business messages are paused', 'Your business messages are back on']));
  });

  it('a pause also stops messages already queued', async () => {
    const admin = await makeAdmin();
    const owner = await makeUser();
    const b = await createBusiness(db(), owner.id, { name: 'Shop', timezone: 'Asia/Kolkata' });
    await updateAutomation(db(), b, 'birthday', { enabled: true, channel: 'email', templateId: null, emailSubject: 's', emailBody: 'b', sendHour: 9 });
    const c = await createCustomer(db(), b, { name: 'N', email: 'n@example.com', consent: true });
    await db().insert(bizMessages).values({ businessId: b.id, customerId: c.id, dedupeKey: 'x', source: 'birthday', channel: 'email', recipient: 'n@example.com', sendAt: NOW });
    await pauseBusiness(db(), admin, b.id, { reason: 'Quality warning' });
    await runJobs(db(), mailer, NOW, 'https://x', null);
    expect((await db().select().from(bizMessages))[0]).toMatchObject({ status: 'skipped', error: 'Business paused by Blessly' });
  });
});

describe('system health', () => {
  it('records job runs and reports overdue work', async () => {
    const now = new Date();
    await runJobsRecorded(db(), mailer, now);
    const h = await systemHealth(db(), now);
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0].ok).toBe(true);
    expect(h.minutesSinceRun).toBe(0);
    expect(h.healthy).toBe(true);
    expect(JSON.parse(h.runs[0].result!)).toHaveProperty('planned');
    expect((await systemHealth(db(), new Date(now.getTime() + 20 * 60000))).healthy).toBe(false); // runner stopped
    await db().delete(jobRuns);
  });
});

describe('password reset', () => {
  it('emails a link that works once, within an hour, and logs out every device', async () => {
    const u = await makeUser({ email: 'reset@example.com', password: 'old password' });
    const { token: session } = await createSession(db(), u.id);
    await requestPasswordReset(db(), mailer, 'nobody@example.com', 'https://app.test', NOW); // silent
    expect(await db().select().from(outbox)).toHaveLength(0);
    await requestPasswordReset(db(), mailer, ' Reset@Example.com ', 'https://app.test', NOW);
    const [mail] = await db().select().from(outbox);
    expect(mail.subject).toBe('Reset your Blessly password');
    const token = /\/reset\/([\w-]+)/.exec(mail.body)![1];
    await expect(resetPassword(db(), { token, password: 'short' })).rejects.toThrow(/8 characters/);
    await expect(resetPassword(db(), { token, password: 'brand new pass' }, new Date(NOW.getTime() + 61 * 60000))).rejects.toThrow(/expired/);
    await resetPassword(db(), { token, password: 'brand new pass' }, NOW);
    await expect(resetPassword(db(), { token, password: 'another one!' }, NOW)).rejects.toThrow(/already used/);
    expect(await userFromSession(db(), session)).toBeNull();
    await expect(logIn(db(), 'reset@example.com', 'brand new pass')).resolves.toMatchObject({ id: u.id });
    await expect(logIn(db(), 'reset@example.com', 'old password')).rejects.toMatchObject({ status: 401 });
  });

  it('limits live links per account', async () => {
    await makeUser({ email: 'many@example.com' });
    for (let i = 0; i < 5; i++) await requestPasswordReset(db(), mailer, 'many@example.com', 'https://app.test', NOW);
    expect(await db().select().from(outbox)).toHaveLength(3);
  });
});

describe('data export and account deletion', () => {
  it('exports everything about the user without secrets', async () => {
    const u = await makeUser({ email: 'me@example.com' });
    await createPerson(db(), u.id, { name: 'Nisha', relationship: 'Friend', occasions: [{ kind: 'birthday', month: 3, day: 4 }] }, 'UTC');
    const b = await createBusiness(db(), u.id, { name: 'Shop' });
    await createCustomer(db(), b, { name: 'Cust', email: 'c@example.com', consent: true });
    const data = await exportUserData(db(), u.id);
    expect(data.account).toMatchObject({ email: 'me@example.com' });
    expect(data.people[0].occasions).toHaveLength(1);
    expect(data.business?.customers).toHaveLength(1);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/passwordHash|waTokenEnc|unsubscribeToken/);
  });

  it('deleting an account hands their family circle to the next person instead of deleting it', async () => {
    const owner = await makeUser({ name: 'Kiran', password: 'correct horse' });
    const fam = await createFamily(db(), owner.id, { name: 'The Sharmas' });
    const member = await makeUser({ name: 'Aarav' });
    const admin = await makeUser({ name: 'Meera' });
    await acceptInvite(db(), member.id, (await createInvite(db(), owner.id, fam.id, { role: 'member' })).token);
    await acceptInvite(db(), admin.id, (await createInvite(db(), owner.id, fam.id, { role: 'admin' })).token);
    await createEvent(db(), owner.id, fam.id, { title: 'Dinner', eventDate: '2026-12-01' });
    const solo = await createFamily(db(), owner.id, { name: 'Just me' });
    await expect(deleteOwnAccount(db(), owner.id, { password: 'wrong', confirm: 'DELETE' })).rejects.toMatchObject({ status: 401 });
    await expect(deleteOwnAccount(db(), owner.id, { password: 'correct horse', confirm: 'delete' })).rejects.toThrow(/Type DELETE/);
    await deleteOwnAccount(db(), owner.id, { password: 'correct horse', confirm: 'DELETE' });
    const v = await getFamily(db(), admin.id, fam.id, 'UTC');
    expect(v.members.map((m) => [m.name, m.role])).toEqual([['Aarav', 'member'], ['Meera', 'owner']]);
    expect(v.events.map((e) => e.title)).toEqual(['Dinner']);
    expect(await db().query.families.findFirst({ where: eq(families.id, solo.id) })).toBeUndefined();
    expect((await listFamilies(db(), member.id))).toHaveLength(1);
    expect(await db().select().from(businesses)).toHaveLength(0);
  });

  it('deleting a business owner removes the business and its customers', async () => {
    const u = await makeUser();
    const b = await createBusiness(db(), u.id, { name: 'Shop' });
    await createCustomer(db(), b, { name: 'Cust', email: 'c@example.com', consent: true });
    await deleteUserEverywhere(db(), u.id);
    expect(await db().query.customers.findMany()).toHaveLength(0);
  });
});
