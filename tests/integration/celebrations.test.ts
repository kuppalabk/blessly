import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import type { EmailMessage, EmailProvider } from '@/server/providers/email';
import type { Storage } from '@/server/providers/storage';
import {
  addGuests, addPost, calendarFile, cancelCelebration, celebrationJobs, createCelebration, deleteCelebration, hostView, listCelebrations,
  moderatePost, postUpdate, publicView, rsvp, sendInvitations, sendThankYous, updateCelebration
} from '@/server/services/celebrations';
import {
  addItem, cancelReservation, createWishlist, deleteItem, markPurchased, moveItem, myReservations, ownerView, publicWishlist, reserveItem, revealWishlist, thankGivers
} from '@/server/services/wishlists';
import { notifications } from '@/server/schema';

beforeEach(resetDb);
afterAll(closeDb);

class Mail implements EmailProvider {
  name = 'test';
  sent: EmailMessage[] = [];
  async send(m: EmailMessage) { this.sent.push(m); return { id: null }; }
}
class MemoryStorage implements Storage {
  name = 'memory';
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.files.set(k, d); }
  async get(k: string) { return this.files.get(k) ?? null; }
  async delete(k: string) { this.files.delete(k); }
}
const APP = 'https://blessly.test';
const NOW = new Date('2026-11-01T10:00:00Z');
const base = { title: 'Asha turns 30', occasion: 'birthday', honoree: 'Asha', date: '2026-11-20', time: '19:30', endTime: '23:00', timezone: 'Europe/London', place: 'The Garden Room', address: '1 High St, London' };
const tokenOf = (url: string) => new URL(url).searchParams.get('g')!;

describe('celebration pages and invitations', () => {
  it('host creates an invite-only party, invites guests, guests RSVP with their personal link', async () => {
    const host = await makeUser({ name: 'Ravi Host' });
    const mail = new Mail();
    const c = await createCelebration(db(), host.id, { ...base, visibility: 'invite', askDiet: true, maxPartySize: 3, rsvpDeadline: '2026-11-15' }, NOW);
    expect(c.startsAt.toISOString()).toBe('2026-11-20T19:30:00.000Z'); // London is on GMT in November
    expect(c.endsAt!.toISOString()).toBe('2026-11-20T23:00:00.000Z');
    await expect(createCelebration(db(), host.id, { ...base, date: '2026-10-01' }, NOW)).rejects.toThrow(/passed/);
    await expect(createCelebration(db(), host.id, { ...base, rsvpDeadline: '2026-12-01' }, NOW)).rejects.toThrow(/deadline/);

    const guests = await addGuests(db(), host.id, c.id, [{ name: 'Meena', email: 'meena@example.com' }, { name: 'Tom', email: 'TOM@example.com' }, { name: 'Gran', phone: '+44 7700 900123' }, { name: 'Tom again', email: 'tom@example.com' }]);
    expect(guests.map((g) => g.name)).toEqual(['Meena', 'Tom', 'Gran']); // duplicate email skipped
    expect((await sendInvitations(db(), host.id, c.id, mail, APP, undefined, NOW)).emailed).toBe(2);
    expect((await sendInvitations(db(), host.id, c.id, mail, APP, undefined, NOW)).emailed).toBe(0); // only once
    const invite = mail.sent.find((m) => m.to === 'meena@example.com')!;
    expect(invite.subject).toBe('Ravi Host invites you: Asha turns 30');
    expect(invite.text).toMatch(/Friday, 20 November 2026 at 19:30 GMT/);
    const link = invite.text.match(/https:\S+/)![0];

    // Invite-only: no link, no entry.
    await expect(publicView(db(), c.slug, null, null)).rejects.toMatchObject({ status: 403 });
    await expect(publicView(db(), c.slug, 'x'.repeat(22), null)).rejects.toMatchObject({ status: 403 });
    const meena = tokenOf(link);
    const view = await publicView(db(), c.slug, meena, null, NOW);
    expect(view.me!.name).toBe('Meena');
    expect(JSON.stringify(view)).not.toContain('tom@example.com'); // other guests' details stay private

    await expect(rsvp(db(), c.slug, meena, { status: 'yes', partySize: 4 }, null, NOW)).rejects.toThrow(/up to 2 others/);
    await rsvp(db(), c.slug, meena, { status: 'yes', partySize: 3, diet: 'Vegetarian', access: 'ignored — not asked' }, null, NOW);
    const tom = guests[1].token;
    await rsvp(db(), c.slug, tom, { status: 'maybe' }, null, NOW);
    await expect(rsvp(db(), c.slug, null, { status: 'yes', name: 'Stranger' }, null, NOW)).rejects.toMatchObject({ status: 403 });

    const hv = await hostView(db(), host.id, c.id);
    expect(hv.summary).toMatchObject({ invited: 3, yes: 1, maybe: 1, waiting: 1, headcount: 3, diets: [{ name: 'Meena', diet: 'Vegetarian' }], access: [] });
    expect((await db().select().from(notifications).where(eq(notifications.userId, host.id))).map((n) => n.title)).toContain('Meena is coming (3 people)');
    expect((await listCelebrations(db(), host.id))[0]).toMatchObject({ guests: 3, coming: 3 });
    const other = await makeUser();
    await expect(hostView(db(), other.id, c.id)).rejects.toMatchObject({ status: 404 });
  });

  it('public pages let anyone RSVP and leave messages and photos; moderation and memories', async () => {
    const host = await makeUser();
    const store = new MemoryStorage();
    const c = await createCelebration(db(), host.id, { ...base, visibility: 'public', moderatePosts: true, showGuestList: true, maxPartySize: 2 }, NOW);
    const r = await rsvp(db(), c.slug, null, { status: 'yes', name: 'Walk-in Wendy', email: 'wendy@example.com', partySize: 2 }, null, NOW);
    expect(r.token).toMatch(/^[\w-]{20,}$/);
    await rsvp(db(), c.slug, r.token, { status: 'no' }, null, NOW); // change of plans
    expect((await hostView(db(), host.id, c.id)).summary).toMatchObject({ yes: 0, no: 1 });
    await rsvp(db(), c.slug, null, { status: 'yes', name: 'Sam' }, null, NOW);
    expect((await publicView(db(), c.slug, null, null, NOW)).coming).toEqual(['Sam']);

    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#f0a' } }).jpeg().toBuffer();
    const p1 = await addPost(db(), c.slug, r.token, { name: 'Wendy', message: 'Have the best day!' }, { data: photo, type: 'image/jpeg' }, null, store, NOW);
    expect(p1).toMatchObject({ kind: 'wish', approved: false });
    // Pending messages are visible to the person who wrote them, not to others.
    expect((await publicView(db(), c.slug, r.token, null, NOW)).posts).toHaveLength(1);
    expect((await publicView(db(), c.slug, null, null, NOW)).posts).toHaveLength(0);
    await moderatePost(db(), host.id, c.id, p1.id, 'approve', store);
    const pub = await publicView(db(), c.slug, null, null, NOW);
    expect(pub.posts[0].media!.url).toMatch(/^\/api\/files\/[\w-]+\?t=/);
    await expect(addPost(db(), c.slug, null, { name: 'Empty' }, null, null, store, NOW)).rejects.toThrow(/message or add a photo/);
    await expect(addPost(db(), c.slug, null, { name: 'Fake' }, { data: Buffer.from('<svg/>'), type: 'video/mp4' }, null, store, NOW)).rejects.toThrow(/video/);

    // After the day: posts become memories, and RSVPs close.
    const after = new Date('2026-11-21T12:00:00Z');
    const p2 = await addPost(db(), c.slug, null, { name: 'Sam', message: 'What a night' }, null, null, store, after);
    expect(p2.kind).toBe('memory');
    expect((await publicView(db(), c.slug, null, null, after)).celebration.past).toBe(true);
    await expect(rsvp(db(), c.slug, null, { status: 'yes', name: 'Late' }, null, after)).rejects.toThrow(/already happened/);

    await moderatePost(db(), host.id, c.id, p1.id, 'delete', store);
    expect(store.files.size).toBe(0);
    await deleteCelebration(db(), host.id, c.id, store);
    await expect(publicView(db(), c.slug, null, null)).rejects.toMatchObject({ status: 404 });
  });

  it('updates, cancelling, thank-yous and a calendar file', async () => {
    const host = await makeUser({ name: 'Host H' });
    const mail = new Mail();
    const c = await createCelebration(db(), host.id, { ...base, description: 'Dress code: sparkly; bring, nothing' }, NOW);
    const [a, b, n] = await addGuests(db(), host.id, c.id, [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }, { name: 'N', email: 'n@example.com' }]);
    await rsvp(db(), c.slug, a.token, { status: 'yes' }, null, NOW);
    await rsvp(db(), c.slug, n.token, { status: 'no' }, null, NOW);
    const u = await postUpdate(db(), host.id, c.id, { body: 'We moved to 8pm!' }, mail, APP);
    expect(u.emailed).toBe(2); // not the person who said no
    expect(mail.sent.map((m) => m.to).sort()).toEqual(['a@example.com', 'b@example.com']);

    const ics = await calendarFile(db(), c.slug, a.token, null, APP);
    expect(ics.body).toContain('DTSTART:20261120T193000Z');
    expect(ics.body).toContain('LOCATION:The Garden Room\\, 1 High St\\, London');
    expect(ics.body).toContain('Dress code: sparkly\\; bring\\, nothing');
    expect(ics.body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);

    await expect(sendThankYous(db(), host.id, c.id, { message: 'Thanks!' }, mail, APP, NOW)).rejects.toThrow(/started/);
    mail.sent = [];
    const thanks = await sendThankYous(db(), host.id, c.id, { message: 'Thank you for coming!' }, mail, APP, new Date('2026-11-21T10:00:00Z'));
    expect(thanks.emailed).toBe(1);
    expect(mail.sent[0].to).toBe('a@example.com');

    mail.sent = [];
    await updateCelebration(db(), host.id, c.id, { ...base, title: 'Asha turns 30 (moved)' });
    await cancelCelebration(db(), host.id, c.id, { message: 'Asha is unwell.' }, mail, APP, NOW);
    expect(mail.sent.map((m) => m.subject)).toEqual(['Cancelled: Asha turns 30 (moved)', 'Cancelled: Asha turns 30 (moved)']);
    expect((await publicView(db(), c.slug, null, null, NOW)).celebration.cancelled).toBe(true);
    await expect(rsvp(db(), c.slug, b.token, { status: 'yes' }, null, NOW)).rejects.toThrow(/cancelled/);
    expect((await calendarFile(db(), c.slug, null, null, APP)).body).toContain('STATUS:CANCELLED');
  });

  it('reminds guests who have not answered, and everyone coming the day before — once', async () => {
    const host = await makeUser();
    const mail = new Mail();
    const c = await createCelebration(db(), host.id, { ...base, rsvpDeadline: '2026-11-15' }, NOW);
    const [a, b] = await addGuests(db(), host.id, c.id, [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }]);
    await sendInvitations(db(), host.id, c.id, mail, APP, undefined, NOW);
    await rsvp(db(), c.slug, a.token, { status: 'yes' }, null, NOW);
    mail.sent = [];
    expect(await celebrationJobs(db(), mail, NOW, APP)).toEqual({ reminders: 0, dayBefore: 0 }); // too early
    const nearDeadline = new Date('2026-11-13T09:00:00Z');
    expect(await celebrationJobs(db(), mail, nearDeadline, APP)).toEqual({ reminders: 1, dayBefore: 0 });
    expect(mail.sent[0]).toMatchObject({ to: 'b@example.com', subject: 'Can you make it? Asha turns 30' });
    expect((await celebrationJobs(db(), mail, nearDeadline, APP)).reminders).toBe(0);
    const dayBefore = new Date('2026-11-19T20:00:00Z');
    expect(await celebrationJobs(db(), mail, dayBefore, APP)).toEqual({ reminders: 0, dayBefore: 1 });
    expect(mail.sent.at(-1)!.subject).toBe('Tomorrow: Asha turns 30');
    expect((await celebrationJobs(db(), mail, dayBefore, APP)).dayBefore).toBe(0);
    void b;
  });
});

describe('wishlists and registries', () => {
  it('friends reserve gifts without spoiling the surprise; the owner reveals and thanks them', async () => {
    const owner = await makeUser({ name: 'Priya Owner' });
    const friend = await makeUser();
    const mail = new Mail();
    const w = await createWishlist(db(), owner.id, { title: 'Priya’s birthday', occasion: 'birthday', eventDate: '2026-12-01' });
    const kettle = await addItem(db(), owner.id, w.id, { title: 'Smeg kettle', url: 'https://shop.example.com/kettle', price: '8999', currency: 'INR', priority: 1 });
    const books = await addItem(db(), owner.id, w.id, { title: 'Novels', price: '24.99', currency: 'GBP', quantity: 3 });
    const extra = await addItem(db(), owner.id, w.id, { title: 'Plant' });
    expect(kettle.price).toBe('₹8,999');
    expect(books.price).toBe('£24.99');
    await expect(addItem(db(), owner.id, w.id, { title: 'Bad', url: 'javascript:alert(1)' })).rejects.toThrow(/web link/);
    await moveItem(db(), owner.id, w.id, extra.id, 'up');
    expect((await publicWishlist(db(), w.slug, null)).items.map((i) => i.title)).toEqual(['Smeg kettle', 'Plant', 'Novels']);
    await deleteItem(db(), owner.id, w.id, extra.id);

    const r1 = await reserveItem(db(), w.slug, kettle.id, { name: 'Neha', email: 'neha@example.com' }, friend.id);
    await expect(reserveItem(db(), w.slug, kettle.id, { name: 'Late Larry' })).rejects.toMatchObject({ status: 409 });
    const r2 = await reserveItem(db(), w.slug, books.id, { name: 'Ali', email: 'ali@example.com', quantity: 2 });
    await expect(reserveItem(db(), w.slug, books.id, { name: 'Bo', quantity: 2 })).rejects.toThrow(/Only 1 left/);
    await expect(reserveItem(db(), w.slug, books.id, { name: 'Self' }, owner.id)).rejects.toThrow(/own list/);

    const pub = await publicWishlist(db(), w.slug, null);
    expect(pub.items.map((i) => [i.title, i.remaining])).toEqual([['Smeg kettle', 0], ['Novels', 1]]);
    // The owner can't see what's taken while it's a surprise — on the public page or their own.
    expect((await publicWishlist(db(), w.slug, owner.id)).items.every((i) => i.remaining === null)).toBe(true);
    const hidden = await ownerView(db(), owner.id, w.id);
    expect(hidden.hidden).toBe(true);
    expect(JSON.stringify(hidden)).not.toContain('Neha');
    const notes = (await db().select().from(notifications).where(eq(notifications.userId, owner.id))).map((n) => n.title);
    expect(notes).toEqual(['Someone reserved a gift from your list', 'Someone reserved a gift from your list']);

    expect(await myReservations(db(), [r1.token, 'nope'])).toEqual([{ itemId: kettle.id, token: r1.token, quantity: 1, purchased: false }]);
    await markPurchased(db(), r1.token, true);
    await cancelReservation(db(), r2.token);
    expect((await publicWishlist(db(), w.slug, null)).items[1].remaining).toBe(3);

    await expect(thankGivers(db(), owner.id, w.id, { message: 'Thank you!' }, mail)).rejects.toThrow(/Reveal/);
    await revealWishlist(db(), owner.id, w.id);
    const shown = await ownerView(db(), owner.id, w.id);
    expect(shown.items[0].reservations).toEqual([expect.objectContaining({ name: 'Neha', purchased: true })]);
    expect((await thankGivers(db(), owner.id, w.id, { message: 'I love the kettle!' }, mail)).emailed).toBe(1);
    expect(mail.sent[0]).toMatchObject({ to: 'neha@example.com', subject: 'Thank you from Priya Owner' });
    expect((await thankGivers(db(), owner.id, w.id, { message: 'Again' }, mail)).emailed).toBe(0);
  });
});
