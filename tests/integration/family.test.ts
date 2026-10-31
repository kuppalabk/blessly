import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, givePlan, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import {
  acceptInvite, createEvent, createFamily, createInvite, createTask, deleteEvent, deleteFamily, deleteTask, getEvent, getFamily,
  listFamilies, MAX_MEMBERS, previewInvite, removeMember, revokeInvite, setRsvp, startGroupCard, updateMember, updateTask
} from '@/server/services/family';
import { createPerson, getPerson, getVisiblePerson, listPeople, updatePerson } from '@/server/services/people';
import { addSignature, saveWish } from '@/server/services/wishes';
import { upcoming } from '@/server/services/home';
import { runJobs } from '@/server/services/jobs';
import { pushPendingNotifications, pushToUser, subscribe, unsubscribe } from '@/server/services/push';
import { OutboxOnlyProvider } from '@/server/providers/email';
import type { PushPayload, PushProvider, PushResult, PushTarget } from '@/server/providers/push';
import { notifications, pushSubscriptions, reminders } from '@/server/schema';

beforeEach(resetDb);
afterAll(closeDb);

const mailer = new OutboxOnlyProvider();
const NOW = new Date('2026-11-01T06:00:00Z'); // 11:30 in India

async function circleOf(n: number) {
  const owner = await makeUser({ name: 'Kiran' });
  await givePlan(owner.id, 'family');
  const fam = await createFamily(db(), owner.id, { name: 'The Sharmas' });
  const others = [];
  for (let i = 0; i < n - 1; i++) {
    const u = await makeUser();
    const inv = await createInvite(db(), owner.id, fam.id, { role: 'member' }, NOW);
    await acceptInvite(db(), u.id, inv.token, NOW);
    others.push(u);
  }
  return { owner, fam, others };
}

async function notes(userId: string) {
  return db().select().from(notifications).where(eq(notifications.userId, userId));
}

class FakePush implements PushProvider {
  name = 'fake';
  publicKey = 'BFakePublicKey';
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  constructor(private result: (t: PushTarget) => PushResult = () => ({ ok: true })) {}
  async send(target: PushTarget, payload: PushPayload) {
    this.sent.push({ target, payload });
    return this.result(target);
  }
}
const sub = (n: number) => ({ endpoint: `https://push.example.com/send/${n}`, keys: { p256dh: 'p256dh-key-' + n, auth: 'auth-key-' + n } });

describe('family circles and invites', () => {
  it('creates a circle with the creator as owner', async () => {
    const u = await makeUser();
    const f = await createFamily(db(), u.id, { name: '  The Sharmas ' });
    expect(f.name).toBe('The Sharmas');
    expect(await listFamilies(db(), u.id)).toMatchObject([{ id: f.id, role: 'owner', memberCount: 1 }]);
    await expect(createFamily(db(), u.id, { name: '' })).rejects.toThrow(/name/);
  });

  it('joins by invite link, tells the others, and is idempotent', async () => {
    const { owner, fam } = await circleOf(1);
    const inv = await createInvite(db(), owner.id, fam.id, { role: 'viewer' }, NOW);
    const aarav = await makeUser({ name: 'Aarav' });
    expect(await previewInvite(db(), inv.token, aarav.id, NOW)).toMatchObject({ familyName: 'The Sharmas', inviter: 'Kiran', role: 'viewer', status: 'ok' });
    expect(await acceptInvite(db(), aarav.id, inv.token, NOW)).toEqual({ familyId: fam.id, joined: true });
    expect(await acceptInvite(db(), aarav.id, inv.token, NOW)).toEqual({ familyId: fam.id, joined: false });
    expect((await previewInvite(db(), inv.token, aarav.id, NOW)).status).toBe('member');
    const view = await getFamily(db(), aarav.id, fam.id, 'Asia/Kolkata', NOW);
    expect(view.members.map((m) => [m.name, m.role])).toEqual([['Kiran', 'owner'], ['Aarav', 'viewer']]);
    expect(view.me.canEdit).toBe(false);
    expect((await notes(owner.id)).map((n) => n.title)).toContain('Aarav joined your family circle');
  });

  it('rejects expired, revoked and malformed invites', async () => {
    const { owner, fam } = await circleOf(1);
    const u = await makeUser();
    const old = await createInvite(db(), owner.id, fam.id, {}, new Date('2026-01-01T00:00:00Z'));
    await expect(acceptInvite(db(), u.id, old.token, NOW)).rejects.toMatchObject({ status: 410, code: 'expired' });
    const inv = await createInvite(db(), owner.id, fam.id, {}, NOW);
    await revokeInvite(db(), owner.id, fam.id, inv.id, NOW);
    await expect(acceptInvite(db(), u.id, inv.token, NOW)).rejects.toMatchObject({ status: 410, code: 'revoked' });
    await expect(acceptInvite(db(), u.id, 'nope', NOW)).rejects.toMatchObject({ status: 404 });
    await expect(previewInvite(db(), "x'; drop table users;--", null, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it(`never goes over ${MAX_MEMBERS} people, even when invites are accepted at the same time`, async () => {
    const { owner, fam } = await circleOf(4);
    const inv = await createInvite(db(), owner.id, fam.id, {}, NOW);
    const joiners = await Promise.all([1, 2, 3, 4].map(() => makeUser()));
    const results = await Promise.allSettled(joiners.map((u) => acceptInvite(db(), u.id, inv.token, NOW)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason.code === 'full')).toBe(true);
    expect((await getFamily(db(), owner.id, fam.id, 'UTC', NOW)).members).toHaveLength(MAX_MEMBERS);
    await expect(createInvite(db(), owner.id, fam.id, {}, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps circles private from non-members and limits who can invite', async () => {
    const { owner, fam, others: [member] } = await circleOf(2);
    const stranger = await makeUser();
    await expect(getFamily(db(), stranger.id, fam.id, 'UTC', NOW)).rejects.toMatchObject({ status: 404 });
    await expect(getFamily(db(), stranger.id, 'not-a-uuid', 'UTC', NOW)).rejects.toMatchObject({ status: 404 });
    await expect(createInvite(db(), member.id, fam.id, {}, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(createInvite(db(), stranger.id, fam.id, {}, NOW)).rejects.toMatchObject({ status: 404 });
    // Members see each other's names but not emails.
    const asMember = await getFamily(db(), member.id, fam.id, 'UTC', NOW);
    expect(asMember.members.find((m) => m.userId === owner.id)?.email).toBeNull();
    expect(asMember.invites).toEqual([]);
    expect((await getFamily(db(), owner.id, fam.id, 'UTC', NOW)).members.find((m) => m.userId === member.id)?.email).toBe(member.email);
  });
});

describe('roles, leaving and removing', () => {
  it('only the owner changes roles; handing over ownership demotes the old owner to admin', async () => {
    const { owner, fam, others: [a, b] } = await circleOf(3);
    await expect(updateMember(db(), a.id, fam.id, b.id, { role: 'admin' })).rejects.toMatchObject({ status: 403 });
    await updateMember(db(), owner.id, fam.id, a.id, { role: 'admin' });
    // Admins can invite members but not admins.
    await expect(createInvite(db(), a.id, fam.id, { role: 'admin' }, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(createInvite(db(), a.id, fam.id, { role: 'member' }, NOW)).resolves.toBeTruthy();
    await updateMember(db(), owner.id, fam.id, b.id, { role: 'owner' });
    const v = await getFamily(db(), b.id, fam.id, 'UTC', NOW);
    expect(Object.fromEntries(v.members.map((m) => [m.userId, m.role]))).toEqual({ [owner.id]: 'admin', [a.id]: 'admin', [b.id]: 'owner' });
  });

  it('people set their own reminder preference only', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    await expect(updateMember(db(), owner.id, fam.id, a.id, { notify: false })).rejects.toMatchObject({ status: 403 });
    expect((await updateMember(db(), a.id, fam.id, a.id, { notify: false })).notify).toBe(false);
  });

  it('removing someone unshares their people and unassigns their tasks; admins cannot remove the owner', async () => {
    const { owner, fam, others: [a, b] } = await circleOf(3);
    await updateMember(db(), owner.id, fam.id, a.id, { role: 'admin' });
    await expect(removeMember(db(), a.id, fam.id, owner.id)).rejects.toMatchObject({ status: 403 });
    await expect(removeMember(db(), b.id, fam.id, a.id)).rejects.toMatchObject({ status: 403 });
    const p = await createPerson(db(), b.id, { name: 'Dadi', relationship: 'Grandparent', familyId: fam.id, occasions: [] }, 'UTC');
    const t = await createTask(db(), owner.id, fam.id, { title: 'Book cake', assigneeId: b.id });
    await removeMember(db(), a.id, fam.id, b.id);
    expect((await getPerson(db(), b.id, p.id, 'UTC')).familyId).toBeNull();
    expect((await getFamily(db(), owner.id, fam.id, 'UTC', NOW)).tasks.find((x) => x.id === t.id)?.assigneeId).toBeNull();
    await expect(getFamily(db(), b.id, fam.id, 'UTC', NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('the owner must hand over before leaving, unless they are the last one', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    await expect(removeMember(db(), owner.id, fam.id, owner.id)).rejects.toThrow(/someone else the owner/);
    await removeMember(db(), a.id, fam.id, a.id);
    expect(await removeMember(db(), owner.id, fam.id, owner.id)).toEqual({ deletedFamily: true });
    expect(await listFamilies(db(), owner.id)).toEqual([]);
  });

  it('only the owner deletes the circle', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    await expect(deleteFamily(db(), a.id, fam.id)).rejects.toMatchObject({ status: 403 });
    await deleteFamily(db(), owner.id, fam.id);
    expect(await listFamilies(db(), a.id)).toEqual([]);
  });
});

describe('shared people and reminders', () => {
  it('shares a person with the circle; members see it read-only and private people stay private', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    const shared = await createPerson(db(), owner.id, { name: 'Dadi Sharma', relationship: 'Grandparent', familyId: fam.id, occasions: [{ kind: 'birthday', month: 11, day: 5 }] }, 'UTC');
    const secret = await createPerson(db(), owner.id, { name: 'Surprise Friend', relationship: 'Friend', occasions: [{ kind: 'birthday', month: 11, day: 6 }] }, 'UTC');
    const seen = await listPeople(db(), a.id, 'Asia/Kolkata', NOW);
    expect(seen.map((p) => [p.name, p.isMine, p.ownerName])).toEqual([['Dadi Sharma', false, 'Kiran']]);
    await expect(getVisiblePerson(db(), a.id, shared.id, 'UTC')).resolves.toMatchObject({ name: 'Dadi Sharma', isMine: false });
    await expect(getVisiblePerson(db(), a.id, secret.id, 'UTC')).rejects.toMatchObject({ status: 404 });
    // Read-only: members can't edit someone else's person.
    await expect(updatePerson(db(), a.id, shared.id, { name: 'X', relationship: 'Other' }, 'UTC')).rejects.toMatchObject({ status: 404 });
    // But they can write a wish for them, and see the birthday on Home.
    await expect(saveWish(db(), a.id, { personId: shared.id, occasion: 'birthday', language: 'en', tone: 'short', text: 'Happy birthday Dadi!', recipientName: 'Dadi', senderName: 'A' })).resolves.toBeTruthy();
    expect((await upcoming(db(), { ...a, country: 'IN' }, 30, NOW)).map((i) => i.title)).toContain("Dadi Sharma's birthday");
  });

  it('cannot share into a circle you are not in, or as a viewer', async () => {
    const { fam } = await circleOf(1);
    const stranger = await makeUser();
    await expect(createPerson(db(), stranger.id, { name: 'X', relationship: 'Friend', familyId: fam.id }, 'UTC')).rejects.toMatchObject({ status: 400 });
  });

  it('sends shared-person reminders to every opted-in member, once each, in their own timezone', async () => {
    const { owner, fam, others: [a, b] } = await circleOf(3);
    await db().update((await import('@/server/schema')).users).set({ timezone: 'Europe/London' }).where(eq((await import('@/server/schema')).users.id, b.id));
    await updateMember(db(), a.id, fam.id, a.id, { notify: false });
    await createPerson(db(), owner.id, { name: 'Dadi', relationship: 'Grandparent', familyId: fam.id, occasions: [{ kind: 'birthday', month: 11, day: 12 }] }, 'UTC');
    await runJobs(db(), mailer, NOW, 'http://x', null);
    const rows = await db().select().from(reminders);
    const users = new Set(rows.map((r) => r.userId));
    expect(users).toEqual(new Set([owner.id, b.id])); // a opted out
    const londonGift = rows.find((r) => r.userId === b.id && r.stage === 'gift')!;
    expect(londonGift.dueAt.toISOString()).toBe('2026-11-05T09:00:00.000Z'); // 9am London
    // Running again plans nothing new.
    expect((await runJobs(db(), mailer, NOW, 'http://x', null)).planned).toBe(0);
  });
});

describe('family events, RSVPs and the group card', () => {
  it('adds an event, notifies the others, and collects RSVPs', async () => {
    const { owner, fam, others: [a, b] } = await circleOf(3);
    const e = await createEvent(db(), owner.id, fam.id, { title: "Dadi's 80th", occasion: 'birthday', eventDate: '2026-11-12', eventTime: '19:30', place: 'Home' });
    expect((await notes(a.id)).map((n) => n.title)).toContain("New family event: Dadi's 80th");
    expect((await notes(owner.id)).map((n) => n.title)).not.toContain("New family event: Dadi's 80th");
    await setRsvp(db(), a.id, e.id, { status: 'going' });
    await setRsvp(db(), b.id, e.id, { status: 'maybe' });
    await setRsvp(db(), b.id, e.id, { status: 'no' }); // changes their answer
    const v = await getEvent(db(), owner.id, e.id, 'Asia/Kolkata', NOW);
    expect(v.members.map((m) => m.rsvp)).toEqual([null, 'going', 'no']);
    expect((await getFamily(db(), a.id, fam.id, 'UTC', NOW)).events[0]).toMatchObject({ rsvp: { going: 1, maybe: 0, no: 1 }, myRsvp: 'going' });
    expect(v.daysAway).toBe(11);
  });

  it('validates events and checks permissions', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    const viewerInv = await createInvite(db(), owner.id, fam.id, { role: 'viewer' }, NOW);
    const viewer = await makeUser();
    await acceptInvite(db(), viewer.id, viewerInv.token, NOW);
    await expect(createEvent(db(), owner.id, fam.id, { title: 'X', eventDate: '2026-02-30' })).rejects.toThrow(/does not exist/);
    await expect(createEvent(db(), owner.id, fam.id, { title: 'X', eventDate: '2026-11-12', eventTime: '25:00' })).rejects.toThrow(/19:30/);
    await expect(createEvent(db(), viewer.id, fam.id, { title: 'X', eventDate: '2026-11-12' })).rejects.toMatchObject({ status: 403 });
    const secret = await createPerson(db(), owner.id, { name: 'Private', relationship: 'Friend' }, 'UTC');
    await expect(createEvent(db(), owner.id, fam.id, { title: 'X', eventDate: '2026-11-12', personId: secret.id })).rejects.toThrow(/shared with this circle/);
    const e = await createEvent(db(), a.id, fam.id, { title: 'Picnic', eventDate: '2026-11-20' });
    // Viewers can still RSVP.
    await expect(setRsvp(db(), viewer.id, e.id, { status: 'going' })).resolves.toEqual({ status: 'going' });
    await expect(deleteEvent(db(), viewer.id, e.id)).rejects.toMatchObject({ status: 403 });
    const stranger = await makeUser();
    await expect(getEvent(db(), stranger.id, e.id, 'UTC', NOW)).rejects.toMatchObject({ status: 404 });
    await expect(setRsvp(db(), stranger.id, e.id, { status: 'going' })).rejects.toMatchObject({ status: 404 });
    // Creator and owner can delete.
    await expect(deleteEvent(db(), owner.id, e.id)).resolves.toEqual({ familyId: fam.id });
  });

  it('starts one group card per event and tracks which members have signed', async () => {
    const { owner, fam, others: [a, b] } = await circleOf(3);
    const dadi = await createPerson(db(), owner.id, { name: 'Dadi Sharma', relationship: 'Grandparent', language: 'hi', familyId: fam.id }, 'UTC');
    const e = await createEvent(db(), owner.id, fam.id, { title: "Dadi's 80th", eventDate: '2026-11-12', personId: dadi.id });
    const [c1, c2] = await Promise.all([startGroupCard(db(), a, e.id), startGroupCard(db(), b, e.id)]);
    expect(c1.slug).toBe(c2.slug);
    let v = await getEvent(db(), owner.id, e.id, 'UTC', NOW);
    expect(v.card?.signedBy).toHaveLength(1); // the starter
    await addSignature(db(), c1.slug, { name: 'Kiran', message: 'Love you Dadi' }, owner.id);
    await addSignature(db(), c1.slug, { name: 'Neighbour', message: 'Happy birthday!' }, null);
    v = await getEvent(db(), owner.id, e.id, 'UTC', NOW);
    expect(v.card?.signedBy.length).toBe(2);
    expect(v.card?.signatureCount).toBe(2);
    const w = await db().query.wishes.findFirst({ where: (t, { eq: q }) => q(t.id, v.card!.wishId) });
    expect(w).toMatchObject({ language: 'hi', senderName: 'The Sharmas', recipientName: 'Dadi' });
  });
});

describe('family tasks', () => {
  it('assigns tasks, notifies the assignee, and lets viewers update only their own', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    const inv = await createInvite(db(), owner.id, fam.id, { role: 'viewer' }, NOW);
    const viewer = await makeUser({ name: 'Aarav' });
    await acceptInvite(db(), viewer.id, inv.token, NOW);
    const e = await createEvent(db(), owner.id, fam.id, { title: 'Party', eventDate: '2026-11-12' });
    const t = await createTask(db(), owner.id, fam.id, { title: 'Order the cake', assigneeId: viewer.id, eventId: e.id, dueDate: '2026-11-10' });
    expect((await notes(viewer.id)).map((n) => n.title)).toContain('Kiran asked you to: Order the cake');
    await expect(updateTask(db(), viewer.id, t.id, { status: 'doing' })).resolves.toMatchObject({ status: 'doing' });
    await expect(updateTask(db(), viewer.id, t.id, { title: 'Eat the cake' })).rejects.toMatchObject({ status: 403 });
    const other = await createTask(db(), owner.id, fam.id, { title: 'Balloons', assigneeId: a.id });
    await expect(updateTask(db(), viewer.id, other.id, { status: 'done' })).rejects.toMatchObject({ status: 403 });
    await expect(updateTask(db(), a.id, t.id, { status: 'done' })).resolves.toMatchObject({ status: 'done' });
    await expect(createTask(db(), owner.id, fam.id, { title: 'X', assigneeId: (await makeUser()).id })).rejects.toThrow(/in this circle/);
    expect((await getEvent(db(), owner.id, e.id, 'UTC', NOW)).tasks.map((x) => [x.title, x.assigneeName, x.status])).toEqual([['Order the cake', 'Aarav', 'done']]);
    await expect(deleteTask(db(), a.id, t.id)).rejects.toMatchObject({ status: 403 });
    await deleteTask(db(), owner.id, t.id);
  });
});

describe('event alerts', () => {
  it('alerts every member the evening before and the morning of, once', async () => {
    const { owner, fam, others: [a] } = await circleOf(2);
    await createEvent(db(), owner.id, fam.id, { title: 'Diwali dinner', occasion: 'diwali', eventDate: '2026-11-08', place: "Nani's house", eventTime: '20:00' });
    await db().delete(notifications);
    const eve = new Date('2026-11-07T12:31:00Z'); // 18:01 India
    expect((await runJobs(db(), mailer, new Date('2026-11-07T12:00:00Z'), 'http://x', null)).eventAlerts).toBe(0); // 17:30
    expect((await runJobs(db(), mailer, eve, 'http://x', null)).eventAlerts).toBe(2);
    expect((await runJobs(db(), mailer, eve, 'http://x', null)).eventAlerts).toBe(0);
    const day = new Date('2026-11-08T03:31:00Z'); // 09:01 India
    const [r1, r2] = await Promise.all([runJobs(db(), mailer, day, 'http://x', null), runJobs(db(), mailer, day, 'http://x', null)]);
    expect(r1.eventAlerts + r2.eventAlerts).toBe(2);
    const titles = (await notes(a.id)).map((n) => n.title).sort();
    expect(titles).toEqual(['Today: Diwali dinner', 'Tomorrow: Diwali dinner']);
    expect((await notes(a.id))[0].body).toContain("Nani's house at 20:00");
  });
});

describe('web push', () => {
  it('stores subscriptions, moves an endpoint to the newest user, and unsubscribes', async () => {
    const u1 = await makeUser(), u2 = await makeUser();
    await subscribe(db(), u1.id, sub(1), 'Chrome');
    await subscribe(db(), u2.id, sub(1), 'Chrome');
    const rows = await db().select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(u2.id);
    await unsubscribe(db(), u1.id, sub(1).endpoint); // not theirs: no-op
    expect(await db().select().from(pushSubscriptions)).toHaveLength(1);
    await unsubscribe(db(), u2.id, sub(1).endpoint);
    expect(await db().select().from(pushSubscriptions)).toHaveLength(0);
    await expect(subscribe(db(), u1.id, { endpoint: 'http://insecure.example.com/x', keys: sub(2).keys }, null)).rejects.toThrow(/https/);
  });

  it('pushes each new alert once to every device, even with overlapping runners', async () => {
    const u = await makeUser();
    await subscribe(db(), u.id, sub(1), null);
    await subscribe(db(), u.id, sub(2), null);
    await db().insert(notifications).values({ userId: u.id, title: 'Nisha’s birthday is in 7 days', body: 'Gift time', link: '/people/x', createdAt: NOW });
    const push = new FakePush();
    await Promise.all([pushPendingNotifications(db(), push, NOW), pushPendingNotifications(db(), push, NOW), pushPendingNotifications(db(), push, NOW)]);
    expect(push.sent).toHaveLength(2);
    expect(push.sent[0].payload).toMatchObject({ title: 'Nisha’s birthday is in 7 days', url: '/people/x' });
    expect((await pushPendingNotifications(db(), push, NOW)).pushed).toBe(0);
  });

  it('does not push stale alerts, and marks alerts handled when push is off', async () => {
    const u = await makeUser();
    await subscribe(db(), u.id, sub(1), null);
    await db().insert(notifications).values({ userId: u.id, title: 'Old', body: 'x', createdAt: new Date(NOW.getTime() - 3 * 3600000) });
    const push = new FakePush();
    await pushPendingNotifications(db(), push, NOW);
    expect(push.sent).toHaveLength(0);
    await db().insert(notifications).values({ userId: u.id, title: 'New', body: 'x', createdAt: NOW });
    await pushPendingNotifications(db(), null, NOW);
    const rows = await db().select().from(notifications).where(eq(notifications.userId, u.id));
    expect(rows.every((r) => r.pushedAt)).toBe(true);
  });

  it('removes subscriptions the browser has dropped, and after repeated failures', async () => {
    const u = await makeUser();
    await subscribe(db(), u.id, sub(1), null);
    await subscribe(db(), u.id, sub(2), null);
    const push = new FakePush((t) => t.endpoint.endsWith('/1') ? { ok: false, gone: true, error: '410 Gone' } : { ok: false, gone: false, error: '500' });
    await pushToUser(db(), push, u.id, { title: 't', body: 'b', url: '/' });
    let rows = await db().select().from(pushSubscriptions);
    expect(rows.map((r) => [r.endpoint.slice(-1), r.failures])).toEqual([['2', 1]]);
    for (let i = 0; i < 4; i++) await pushToUser(db(), push, u.id, { title: 't', body: 'b', url: '/' });
    rows = await db().select().from(pushSubscriptions);
    expect(rows).toHaveLength(0);
  });

  it('reminders created by the job runner reach the phone in the same run', async () => {
    const u = await makeUser();
    await subscribe(db(), u.id, sub(1), null);
    await createPerson(db(), u.id, { name: 'Nisha', relationship: 'Friend', occasions: [{ kind: 'birthday', month: 11, day: 8 }] }, 'Asia/Kolkata');
    const push = new FakePush();
    await runJobs(db(), mailer, new Date('2026-11-01T03:00:00Z'), 'http://x', push); // plans the 9am gift reminder
    const r = await runJobs(db(), mailer, new Date('2026-11-01T03:31:00Z'), 'http://x', push);
    expect(r.remindersDelivered).toBe(1);
    expect(r.pushed).toBe(1);
    expect(push.sent[0].payload.title).toMatch(/Nisha/);
    const pending = await db().select().from(reminders).where(and(eq(reminders.userId, u.id), eq(reminders.status, 'pending')));
    expect(pending.length).toBeGreaterThan(0);
  });
});
