import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { celebrationGuests, celebrationPosts, celebrationUpdates, celebrations, files, users, wishlists } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { sendEmail, type EmailProvider } from '../providers/email';
import { fileUrl, storageFromEnv, type Storage } from '../providers/storage';
import { notify } from './notify';
import { processImage } from './albums';
import { MAX_VIDEO_BYTES, sniffMedia } from './designs';
import { OCCASIONS, type OccasionId } from '@/lib/i18n-data';
import { fromISO, isValidTimezone, zonedTime } from '@/lib/dates';

export type Celebration = typeof celebrations.$inferSelect;
export type Guest = typeof celebrationGuests.$inferSelect;

const uuid = z.string().uuid();
const occasionIds = OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]];
export const MAX_GUESTS = 500;
export const MAX_POSTS = 1000;
export const MAX_POST_PHOTO_BYTES = 15 * 1024 * 1024;
const STATUSES = ['yes', 'no', 'maybe'] as const;

const token = () => randomBytes(16).toString('base64url');
const slug = () => randomBytes(8).toString('base64url');
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const httpUrl = z.string().trim().max(500).refine((u) => /^https:\/\/[^\s]+$/.test(u), 'Use a link starting with https://');

/* ---------------- Host: create and edit ---------------- */

export const celebrationSchema = z.object({
  title: z.string().trim().min(2, 'Give it a name').max(100),
  occasion: z.enum(occasionIds).default('birthday'),
  honoree: optText(80),
  description: optText(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time').default('18:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => v || null),
  timezone: z.string().refine(isValidTimezone, 'Unknown time zone'),
  place: optText(120),
  address: optText(300),
  onlineUrl: httpUrl.optional().nullable().or(z.literal('')).transform((v) => v || null),
  designIndex: z.coerce.number().int().min(0).max(249).default(0),
  visibility: z.enum(['public', 'link', 'invite']).default('link'),
  rsvpEnabled: z.boolean().default(true),
  rsvpDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => v || null),
  askDiet: z.boolean().default(false),
  askAccess: z.boolean().default(false),
  maxPartySize: z.coerce.number().int().min(1).max(10).default(1),
  guestPosts: z.boolean().default(true),
  moderatePosts: z.boolean().default(false),
  showGuestList: z.boolean().default(false),
  wishlistId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null)
});

function times(input: z.infer<typeof celebrationSchema>) {
  const day = fromISO(input.date);
  const [h, m] = input.time.split(':').map(Number);
  if (h > 23 || m > 59) throw badRequest('Choose a valid time');
  const startsAt = zonedTime(day, h, m, input.timezone);
  let endsAt: Date | null = null;
  if (input.endTime) {
    const [eh, em] = input.endTime.split(':').map(Number);
    endsAt = zonedTime(day, eh, em, input.timezone);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86400000); // ends after midnight
  }
  const rsvpDeadline = input.rsvpDeadline ? zonedTime(fromISO(input.rsvpDeadline), 23, 59, input.timezone) : null;
  if (rsvpDeadline && rsvpDeadline > startsAt) throw badRequest('The RSVP deadline should be before the celebration');
  return { startsAt, endsAt, rsvpDeadline };
}

async function checkWishlist(db: DB, userId: string, id: string | null) {
  if (!id) return;
  const w = await db.query.wishlists.findFirst({ where: and(eq(wishlists.id, id), eq(wishlists.userId, userId)) });
  if (!w) throw badRequest('Choose one of your wishlists');
}

function columns(input: z.infer<typeof celebrationSchema>) {
  const { date: _d, time: _t, endTime: _e, rsvpDeadline: _r, ...rest } = input;
  return { ...rest, ...times(input) };
}

export async function createCelebration(db: DB, userId: string, raw: unknown, now = new Date()) {
  const input = celebrationSchema.parse(raw);
  await checkWishlist(db, userId, input.wishlistId);
  const cols = columns(input);
  if (cols.startsAt.getTime() < now.getTime() - 86400000) throw badRequest('Choose a date that hasn’t passed');
  const [{ n }] = await db.select({ n: count() }).from(celebrations).where(eq(celebrations.userId, userId));
  if (n >= 200) throw badRequest('You can have up to 200 celebrations');
  const [c] = await db.insert(celebrations).values({ ...cols, userId, slug: slug() }).returning();
  return c;
}

export async function loadOwn(db: DB, userId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Celebration not found');
  const c = await db.query.celebrations.findFirst({ where: and(eq(celebrations.id, id), eq(celebrations.userId, userId)) });
  if (!c) throw notFound('Celebration not found');
  return c;
}

export async function updateCelebration(db: DB, userId: string, id: string, raw: unknown) {
  const c = await loadOwn(db, userId, id);
  const input = celebrationSchema.parse(raw);
  await checkWishlist(db, userId, input.wishlistId);
  const [u] = await db.update(celebrations).set({ ...columns(input), updatedAt: new Date() }).where(eq(celebrations.id, c.id)).returning();
  return u;
}

export async function listCelebrations(db: DB, userId: string) {
  const rows = await db.select().from(celebrations).where(eq(celebrations.userId, userId)).orderBy(desc(celebrations.startsAt));
  if (!rows.length) return [];
  const counts = await db.select({ id: celebrationGuests.celebrationId, status: celebrationGuests.status, n: count(), people: sql<number>`sum(${celebrationGuests.partySize})::int` })
    .from(celebrationGuests).where(inArray(celebrationGuests.celebrationId, rows.map((r) => r.id))).groupBy(celebrationGuests.celebrationId, celebrationGuests.status);
  return rows.map((c) => {
    const mine = counts.filter((x) => x.id === c.id);
    return { ...c, guests: mine.reduce((s, x) => s + x.n, 0), coming: mine.find((x) => x.status === 'yes')?.people ?? 0 };
  });
}

const withMedia = <T extends { fileId: string | null }>(p: T, mime: Map<string, string>) => ({ ...p, media: p.fileId ? { url: fileUrl(p.fileId), kind: (mime.get(p.fileId) ?? '').startsWith('video/') ? 'video' as const : 'image' as const } : null });

async function mimes(db: DB, ids: (string | null)[]) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return new Map<string, string>();
  return new Map((await db.select({ id: files.id, mime: files.mime }).from(files).where(inArray(files.id, list))).map((f) => [f.id, f.mime]));
}

export function summary(guests: Guest[]) {
  const by = (s: string) => guests.filter((g) => g.status === s);
  const yes = by('yes');
  return {
    invited: guests.length,
    yes: yes.length, no: by('no').length, maybe: by('maybe').length, waiting: by('invited').length,
    headcount: yes.reduce((s, g) => s + g.partySize, 0),
    diets: yes.filter((g) => g.diet).map((g) => ({ name: g.name, diet: g.diet! })),
    access: yes.filter((g) => g.access).map((g) => ({ name: g.name, access: g.access! }))
  };
}

/** Everything the host sees. */
export async function hostView(db: DB, userId: string, id: string) {
  const c = await loadOwn(db, userId, id);
  const guests = await db.select().from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id)).orderBy(asc(celebrationGuests.createdAt));
  const posts = await db.select().from(celebrationPosts).where(eq(celebrationPosts.celebrationId, c.id)).orderBy(desc(celebrationPosts.createdAt));
  const updates = await db.select().from(celebrationUpdates).where(eq(celebrationUpdates.celebrationId, c.id)).orderBy(desc(celebrationUpdates.createdAt));
  const m = await mimes(db, posts.map((p) => p.fileId));
  return { celebration: c, guests, posts: posts.map((p) => withMedia(p, m)), updates, summary: summary(guests) };
}

export async function deleteCelebration(db: DB, userId: string, id: string, storage: Storage = storageFromEnv()) {
  const c = await loadOwn(db, userId, id);
  const fileIds = (await db.select({ id: celebrationPosts.fileId }).from(celebrationPosts).where(and(eq(celebrationPosts.celebrationId, c.id), isNotNull(celebrationPosts.fileId)))).map((r) => r.id!);
  const keys = fileIds.length ? await db.select({ id: files.id, key: files.key }).from(files).where(inArray(files.id, fileIds)) : [];
  await db.delete(celebrations).where(eq(celebrations.id, c.id));
  if (keys.length) await db.delete(files).where(inArray(files.id, keys.map((k) => k.id)));
  await Promise.all(keys.map((k) => storage.delete(k.key).catch(() => undefined)));
}

/* ---------------- Guests and invitations ---------------- */

export const guestSchema = z.object({
  name: z.string().trim().min(1, 'Add a name').max(80),
  email: z.string().trim().toLowerCase().email('Check the email address').max(200).optional().nullable().or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'Check the phone number').optional().nullable().or(z.literal('')).transform((v) => v || null)
});

export async function addGuests(db: DB, userId: string, id: string, raw: unknown) {
  const c = await loadOwn(db, userId, id);
  const list = z.array(guestSchema).min(1).max(MAX_GUESTS).parse(raw);
  const existing = await db.select({ email: celebrationGuests.email }).from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id));
  if (existing.length + list.length > MAX_GUESTS) throw badRequest(`A celebration can have up to ${MAX_GUESTS} guests`);
  const seen = new Set(existing.map((e) => e.email).filter(Boolean));
  const fresh = list.filter((g) => !g.email || !seen.has(g.email) && seen.add(g.email));
  if (!fresh.length) return [];
  return db.insert(celebrationGuests).values(fresh.map((g) => ({ ...g, celebrationId: c.id, token: token() }))).returning();
}

export async function updateGuest(db: DB, userId: string, id: string, guestId: string, raw: unknown) {
  const c = await loadOwn(db, userId, id);
  const input = guestSchema.partial().extend({ status: z.enum(['invited', ...STATUSES]).optional(), partySize: z.coerce.number().int().min(1).max(10).optional() }).parse(raw);
  const [g] = await db.update(celebrationGuests).set(input).where(and(eq(celebrationGuests.id, guestId), eq(celebrationGuests.celebrationId, c.id))).returning();
  if (!g) throw notFound('Guest not found');
  return g;
}

export async function removeGuest(db: DB, userId: string, id: string, guestId: string) {
  const c = await loadOwn(db, userId, id);
  if (!uuid.safeParse(guestId).success) throw notFound('Guest not found');
  await db.delete(celebrationGuests).where(and(eq(celebrationGuests.id, guestId), eq(celebrationGuests.celebrationId, c.id)));
}

export const guestLink = (appUrl: string, c: Celebration, g: Guest) => `${appUrl}/c/${c.slug}?g=${g.token}`;

function whenText(c: Celebration) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: c.timezone, timeZoneName: 'short' }).format(c.startsAt);
}
function whereText(c: Celebration) {
  return [c.place, c.address].filter(Boolean).join(', ') || (c.onlineUrl ? 'Online' : '');
}

/** Emails invitations to guests with an email address who haven't been invited yet (or the chosen guests). */
export async function sendInvitations(db: DB, userId: string, id: string, email: EmailProvider, appUrl: string, guestIds?: string[], now = new Date()) {
  const c = await loadOwn(db, userId, id);
  if (c.cancelledAt) throw badRequest('This celebration was cancelled');
  const host = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  const where = guestIds?.length
    ? and(eq(celebrationGuests.celebrationId, c.id), inArray(celebrationGuests.id, guestIds.filter((g) => uuid.safeParse(g).success)))
    : and(eq(celebrationGuests.celebrationId, c.id), isNull(celebrationGuests.invitedAt));
  const guests = (await db.select().from(celebrationGuests).where(where)).filter((g) => g.email);
  for (const g of guests) {
    await sendEmail(db, email, {
      to: g.email!,
      subject: `${host.name} invites you: ${c.title}`,
      text: [
        `Hi ${g.name},`, '',
        `${host.name} would love you to join ${c.title}.`, '',
        `When: ${whenText(c)}`, whereText(c) ? `Where: ${whereText(c)}` : '', '',
        c.description ?? '', '',
        c.rsvpEnabled ? `Let ${host.name.split(' ')[0]} know if you can come:` : 'Details, and a place to leave a message:',
        guestLink(appUrl, c, g), '',
        'This link is personal to you — please don’t share it.'
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
    });
    await db.update(celebrationGuests).set({ invitedAt: now }).where(eq(celebrationGuests.id, g.id));
  }
  return { emailed: guests.length };
}

/* ---------------- Public page ---------------- */

async function bySlug(db: DB, s: string) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(s)) throw notFound('Celebration not found');
  const c = await db.query.celebrations.findFirst({ where: eq(celebrations.slug, s) });
  if (!c) throw notFound('Celebration not found');
  return c;
}

async function guestByToken(db: DB, c: Celebration, t: string | null | undefined) {
  if (!t || !/^[A-Za-z0-9_-]{10,40}$/.test(t)) return null;
  const g = await db.query.celebrationGuests.findFirst({ where: and(eq(celebrationGuests.token, t), eq(celebrationGuests.celebrationId, c.id)) });
  return g ?? null;
}

/** Who is looking: the host, an invited guest (by their link), or anyone (public and link pages). */
async function access(db: DB, s: string, t: string | null | undefined, viewerId: string | null) {
  const c = await bySlug(db, s);
  const isHost = viewerId === c.userId;
  const guest = await guestByToken(db, c, t);
  if (!isHost && !guest && c.visibility === 'invite') throw new AppError(403, 'invite_only', 'This celebration is for invited guests. Open it from your invitation.');
  return { c, isHost, guest };
}

export const isPast = (c: Celebration, now = new Date()) => now.getTime() > (c.endsAt ?? new Date(c.startsAt.getTime() + 6 * 3600000)).getTime();

export async function publicView(db: DB, s: string, t: string | null | undefined, viewerId: string | null, now = new Date()) {
  const { c, isHost, guest } = await access(db, s, t, viewerId);
  const host = (await db.query.users.findFirst({ where: eq(users.id, c.userId) }))!;
  const guests = await db.select().from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id));
  const posts = await db.select().from(celebrationPosts).where(and(eq(celebrationPosts.celebrationId, c.id), or(eq(celebrationPosts.approved, true), guest ? eq(celebrationPosts.guestId, guest.id) : sql`false`))).orderBy(desc(celebrationPosts.createdAt)).limit(300);
  const updates = await db.select().from(celebrationUpdates).where(eq(celebrationUpdates.celebrationId, c.id)).orderBy(desc(celebrationUpdates.createdAt)).limit(20);
  const m = await mimes(db, posts.map((p) => p.fileId));
  const wl = c.wishlistId ? await db.query.wishlists.findFirst({ where: eq(wishlists.id, c.wishlistId) }) : null;
  const s2 = summary(guests);
  return {
    celebration: {
      title: c.title, occasion: c.occasion as OccasionId, honoree: c.honoree, description: c.description, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt?.toISOString() ?? null,
      timezone: c.timezone, place: c.place, address: c.address, onlineUrl: guest || isHost || c.visibility !== 'public' ? c.onlineUrl : null,
      designIndex: c.designIndex, visibility: c.visibility, rsvpEnabled: c.rsvpEnabled, rsvpDeadline: c.rsvpDeadline?.toISOString() ?? null,
      askDiet: c.askDiet, askAccess: c.askAccess, maxPartySize: c.maxPartySize, guestPosts: c.guestPosts, moderatePosts: c.moderatePosts,
      cancelled: !!c.cancelledAt, past: isPast(c, now), slug: c.slug, hostName: host.name, wishlistSlug: wl?.slug ?? null
    },
    isHost,
    me: guest ? { name: guest.name, status: guest.status, partySize: guest.partySize, diet: guest.diet, access: guest.access, note: guest.note, email: guest.email, token: guest.token } : null,
    coming: c.showGuestList || isHost ? guests.filter((g) => g.status === 'yes').map((g) => g.name) : [],
    counts: { yes: s2.headcount, maybe: s2.maybe },
    posts: posts.map((p) => ({ id: p.id, name: p.name, message: p.message, kind: p.kind, createdAt: p.createdAt.toISOString(), pending: !p.approved, media: withMedia(p, m).media })),
    updates: updates.map((u) => ({ id: u.id, body: u.body, createdAt: u.createdAt.toISOString() }))
  };
}
export type PublicCelebration = Awaited<ReturnType<typeof publicView>>;

export const rsvpSchema = z.object({
  status: z.enum(STATUSES),
  name: z.string().trim().min(1, 'Add your name').max(80).optional(),
  email: z.string().trim().toLowerCase().email('Check your email').max(200).optional().or(z.literal('')).transform((v) => v || null),
  partySize: z.coerce.number().int().min(1).max(10).default(1),
  diet: optText(200),
  access: optText(200),
  note: optText(500)
});

/** Answer an invitation. Guests without a personal link (public and link pages) are added to the guest list. */
export async function rsvp(db: DB, s: string, t: string | null | undefined, raw: unknown, viewerId: string | null = null, now = new Date()) {
  const { c, guest } = await access(db, s, t, viewerId);
  if (!c.rsvpEnabled) throw badRequest('This celebration isn’t taking replies');
  if (c.cancelledAt) throw badRequest('This celebration was cancelled');
  if (isPast(c, now)) throw badRequest('This celebration has already happened');
  if (c.rsvpDeadline && now > c.rsvpDeadline && !guest) throw badRequest('Replies have closed — contact the host');
  const input = rsvpSchema.parse(raw);
  if (input.partySize > c.maxPartySize) throw badRequest(c.maxPartySize === 1 ? 'This invitation is just for you' : `You can bring up to ${c.maxPartySize - 1} others`);
  const answer = { status: input.status, partySize: input.status === 'no' ? 1 : input.partySize, diet: c.askDiet ? input.diet : null, access: c.askAccess ? input.access : null, note: input.note, respondedAt: now };
  let g: Guest;
  if (guest) {
    [g] = await db.update(celebrationGuests).set({ ...answer, ...(input.email && !guest.email ? { email: input.email } : {}) }).where(eq(celebrationGuests.id, guest.id)).returning();
  } else {
    if (!input.name) throw badRequest('Add your name');
    const [{ n }] = await db.select({ n: count() }).from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id));
    if (n >= MAX_GUESTS) throw badRequest('This celebration is full');
    [g] = await db.insert(celebrationGuests).values({ celebrationId: c.id, name: input.name, email: input.email, token: token(), selfAdded: true, userId: viewerId, ...answer }).returning();
  }
  const word = { yes: 'is coming', no: 'can’t make it', maybe: 'might come' }[input.status];
  await notify(db, [c.userId], { title: `${g.name} ${word}${g.partySize > 1 && input.status === 'yes' ? ` (${g.partySize} people)` : ''}`, body: c.title, link: `/celebrations/${c.id}` });
  return { token: g.token, status: g.status };
}

export const postSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(80),
  message: z.string().trim().max(1000).default('')
});

/** A guest message with an optional photo or video (the group card before the day, memories after). */
export async function addPost(db: DB, s: string, t: string | null | undefined, raw: unknown, file: { data: Buffer; type: string } | null, viewerId: string | null = null, storage: Storage = storageFromEnv(), now = new Date()) {
  const { c, isHost, guest } = await access(db, s, t, viewerId);
  if (!c.guestPosts && !isHost) throw badRequest('Messages are turned off for this celebration');
  const input = postSchema.parse(raw);
  if (!input.message && !file) throw badRequest('Write a message or add a photo');
  const [{ n }] = await db.select({ n: count() }).from(celebrationPosts).where(eq(celebrationPosts.celebrationId, c.id));
  if (n >= MAX_POSTS) throw badRequest('This page is full');
  let fileId: string | null = null;
  if (file) {
    const id = randomUUID();
    if (file.type.startsWith('video/')) {
      const sn = sniffMedia(file.data);
      if (!sn?.video) throw badRequest('Upload an MP4 or WebM video');
      if (file.data.length > MAX_VIDEO_BYTES) throw badRequest('Videos can be up to 40 MB');
      const key = `files/${c.userId}/${id}.${sn.ext}`;
      await storage.put(key, file.data, sn.mime);
      await db.insert(files).values({ id, ownerId: c.userId, kind: 'celebration-video', key, mime: sn.mime, bytes: file.data.length });
    } else {
      if (file.data.length > MAX_POST_PHOTO_BYTES) throw badRequest('Photos can be up to 15 MB');
      const img = await processImage(file.data);
      const key = `files/${c.userId}/${id}.webp`;
      await storage.put(key, img.full, 'image/webp');
      await db.insert(files).values({ id, ownerId: c.userId, kind: 'celebration-photo', key, mime: 'image/webp', bytes: img.full.length, width: img.width, height: img.height });
    }
    fileId = id;
  }
  const [p] = await db.insert(celebrationPosts).values({
    celebrationId: c.id, guestId: guest?.id ?? null, userId: viewerId, name: input.name, message: input.message, fileId,
    kind: now >= c.startsAt ? 'memory' : 'wish', approved: isHost || !c.moderatePosts
  }).returning();
  if (!isHost) await notify(db, [c.userId], { title: `${p.name} ${fileId ? 'shared a photo' : 'left a message'}${p.approved ? '' : ' (waiting for your approval)'}`, body: c.title, link: `/celebrations/${c.id}` });
  return p;
}

export async function moderatePost(db: DB, userId: string, id: string, postId: string, action: 'approve' | 'delete', storage: Storage = storageFromEnv()) {
  const c = await loadOwn(db, userId, id);
  if (!uuid.safeParse(postId).success) throw notFound('Message not found');
  const p = await db.query.celebrationPosts.findFirst({ where: and(eq(celebrationPosts.id, postId), eq(celebrationPosts.celebrationId, c.id)) });
  if (!p) throw notFound('Message not found');
  if (action === 'approve') { await db.update(celebrationPosts).set({ approved: true }).where(eq(celebrationPosts.id, p.id)); return; }
  await db.delete(celebrationPosts).where(eq(celebrationPosts.id, p.id));
  if (p.fileId) {
    const f = await db.query.files.findFirst({ where: eq(files.id, p.fileId) });
    if (f) { await db.delete(files).where(eq(files.id, f.id)); await storage.delete(f.key).catch(() => undefined); }
  }
}

/* ---------------- Updates, cancelling, thank-yous ---------------- */

const reachable = (g: Guest) => !!g.email && g.status !== 'no';

export async function postUpdate(db: DB, userId: string, id: string, raw: unknown, email: EmailProvider, appUrl: string) {
  const c = await loadOwn(db, userId, id);
  const { body, notifyGuests } = z.object({ body: z.string().trim().min(3, 'Write the update').max(2000), notifyGuests: z.boolean().default(true) }).parse(raw);
  const guests = notifyGuests ? (await db.select().from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id))).filter(reachable) : [];
  for (const g of guests) await sendEmail(db, email, { to: g.email!, subject: `Update: ${c.title}`, text: `Hi ${g.name},\n\n${body}\n\n${guestLink(appUrl, c, g)}` });
  const [u] = await db.insert(celebrationUpdates).values({ celebrationId: c.id, body, emailed: guests.length }).returning();
  return u;
}

export async function cancelCelebration(db: DB, userId: string, id: string, raw: unknown, email: EmailProvider, appUrl: string, now = new Date()) {
  const c = await loadOwn(db, userId, id);
  if (c.cancelledAt) return c;
  const { message } = z.object({ message: z.string().trim().max(1000).default('') }).parse(raw);
  const guests = (await db.select().from(celebrationGuests).where(eq(celebrationGuests.celebrationId, c.id))).filter(reachable);
  for (const g of guests) await sendEmail(db, email, { to: g.email!, subject: `Cancelled: ${c.title}`, text: `Hi ${g.name},\n\nSorry — ${c.title} on ${whenText(c)} has been cancelled.${message ? `\n\n${message}` : ''}\n\n${guestLink(appUrl, c, g)}` });
  const [u] = await db.update(celebrations).set({ cancelledAt: now }).where(eq(celebrations.id, c.id)).returning();
  await db.insert(celebrationUpdates).values({ celebrationId: c.id, body: `This celebration has been cancelled.${message ? ` ${message}` : ''}`, emailed: guests.length });
  return u;
}

/** After the day: thank the guests who came (and anyone who left a message). */
export async function sendThankYous(db: DB, userId: string, id: string, raw: unknown, email: EmailProvider, appUrl: string, now = new Date()) {
  const c = await loadOwn(db, userId, id);
  if (now < c.startsAt) throw badRequest('You can send thank-yous once the celebration has started');
  const { message } = z.object({ message: z.string().trim().min(3, 'Write a thank-you message').max(2000) }).parse(raw);
  const posters = new Set((await db.select({ g: celebrationPosts.guestId }).from(celebrationPosts).where(eq(celebrationPosts.celebrationId, c.id))).map((p) => p.g));
  const guests = (await db.select().from(celebrationGuests).where(and(eq(celebrationGuests.celebrationId, c.id), isNull(celebrationGuests.thankedAt))))
    .filter((g) => g.email && (g.status === 'yes' || posters.has(g.id)));
  for (const g of guests) {
    await sendEmail(db, email, { to: g.email!, subject: `Thank you — ${c.title}`, text: `Hi ${g.name},\n\n${message}\n\nPhotos and messages from the day: ${guestLink(appUrl, c, g)}` });
    await db.update(celebrationGuests).set({ thankedAt: now }).where(eq(celebrationGuests.id, g.id));
  }
  return { emailed: guests.length };
}

/* ---------------- Calendar file ---------------- */

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Fold lines longer than 75 octets (RFC 5545). */
const fold = (line: string) => {
  const out: string[] = []; let cur = '';
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
  return [...out, cur].join('\r\n');
};

export async function calendarFile(db: DB, s: string, t: string | null | undefined, viewerId: string | null, appUrl: string) {
  const { c, guest } = await access(db, s, t, viewerId);
  const end = c.endsAt ?? new Date(c.startsAt.getTime() + 3 * 3600000);
  const url = guest ? guestLink(appUrl, c, guest) : `${appUrl}/c/${c.slug}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blessly//Celebrations//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${c.id}@blessly`, `DTSTAMP:${icsDate(c.updatedAt)}`, `DTSTART:${icsDate(c.startsAt)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(c.title)}`,
    ...(whereText(c) ? [`LOCATION:${icsEscape(whereText(c))}`] : []),
    `DESCRIPTION:${icsEscape([c.description ?? '', c.onlineUrl ? `Join online: ${c.onlineUrl}` : '', url].filter(Boolean).join('\n\n'))}`,
    `URL:${url}`, `STATUS:${c.cancelledAt ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return { filename: `${c.title.replace(/[^\p{L}\p{N} -]+/gu, '').trim().slice(0, 50) || 'celebration'}.ics`, body: lines.map(fold).join('\r\n') + '\r\n' };
}

/* ---------------- Reminders (run by the job runner) ---------------- */

export async function celebrationJobs(db: DB, email: EmailProvider, now: Date, appUrl: string) {
  let reminders = 0, dayBefore = 0;
  const soon = new Date(now.getTime() + 4 * 86400000);
  const upcoming = await db.select().from(celebrations).where(and(isNull(celebrations.cancelledAt), gt(celebrations.startsAt, now), lte(celebrations.startsAt, new Date(now.getTime() + 30 * 86400000))));
  for (const c of upcoming) {
    const host = await db.query.users.findFirst({ where: eq(users.id, c.userId) });
    // A nudge to guests who haven't answered: 3 days before the RSVP deadline (or 4 days before the day).
    const due = c.rsvpDeadline ? c.rsvpDeadline.getTime() - 3 * 86400000 <= now.getTime() && now < c.rsvpDeadline : c.startsAt <= soon;
    if (c.rsvpEnabled && due) {
      const waiting = await db.select().from(celebrationGuests).where(and(eq(celebrationGuests.celebrationId, c.id), eq(celebrationGuests.status, 'invited'), isNotNull(celebrationGuests.invitedAt), isNull(celebrationGuests.remindedAt), isNotNull(celebrationGuests.email)));
      for (const g of waiting) {
        try {
          await sendEmail(db, email, { to: g.email!, subject: `Can you make it? ${c.title}`, text: `Hi ${g.name},\n\n${host?.name ?? 'Your host'} is planning ${c.title} on ${whenText(c)} and would love to know if you can come.\n\n${guestLink(appUrl, c, g)}` });
          await db.update(celebrationGuests).set({ remindedAt: now }).where(eq(celebrationGuests.id, g.id));
          reminders++;
        } catch (e) { console.error('[celebrations] reminder failed', (e as Error).message); }
      }
    }
    // The day before: details for everyone coming.
    if (c.startsAt.getTime() - now.getTime() <= 26 * 3600000) {
      const coming = await db.select().from(celebrationGuests).where(and(eq(celebrationGuests.celebrationId, c.id), inArray(celebrationGuests.status, ['yes', 'maybe']), isNull(celebrationGuests.dayBeforeAt), isNotNull(celebrationGuests.email)));
      for (const g of coming) {
        try {
          await sendEmail(db, email, { to: g.email!, subject: `Tomorrow: ${c.title}`, text: `Hi ${g.name},\n\nA reminder: ${c.title} is on ${whenText(c)}.${whereText(c) ? `\nWhere: ${whereText(c)}` : ''}${c.onlineUrl ? `\nJoin online: ${c.onlineUrl}` : ''}\n\n${guestLink(appUrl, c, g)}` });
          await db.update(celebrationGuests).set({ dayBeforeAt: now }).where(eq(celebrationGuests.id, g.id));
          dayBefore++;
        } catch (e) { console.error('[celebrations] day-before failed', (e as Error).message); }
      }
    }
  }
  return { reminders, dayBefore };
}
