import { randomBytes, randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { and, asc, count, desc, eq, inArray, isNotNull, max, or } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { albumPhotos, albums, familyMembers, families, users } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { mediaUrl, storageFromEnv, type Storage } from '../providers/storage';
import { entitlements, planLimit } from './billing';
import { ALBUM_DESIGNS, defaultAlbumDesign } from '@/lib/albums';
import { OCCASIONS } from '@/lib/i18n-data';

const uuid = z.string().uuid();
const occasionIds = OCCASIONS.map((o) => o.id) as [string, ...string[]];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export type Album = typeof albums.$inferSelect;
export type Photo = typeof albumPhotos.$inferSelect;

/** Who may do what with an album. Family members of a shared album can view and add photos. */
async function access(db: DB, a: Album, userId: string | null) {
  const isOwner = !!userId && a.userId === userId;
  let familyRole: string | null = null;
  if (!isOwner && userId && a.familyId) {
    const m = await db.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, a.familyId), eq(familyMembers.userId, userId)) });
    familyRole = m?.role ?? null;
  }
  return { isOwner, canView: isOwner || !!familyRole, canAdd: isOwner || (!!familyRole && familyRole !== 'viewer') };
}

async function loadAlbum(db: DB, userId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Album not found');
  const a = await db.query.albums.findFirst({ where: eq(albums.id, id) });
  if (!a) throw notFound('Album not found');
  const acc = await access(db, a, userId);
  if (!acc.canView) throw notFound('Album not found');
  return { a, acc };
}

const withUrls = (p: Photo) => ({ ...p, thumbUrl: mediaUrl(p.id, 'thumb'), fullUrl: mediaUrl(p.id, 'full') });

/* ---------------- Albums ---------------- */

export const albumSchema = z.object({
  title: z.string().trim().min(1, 'Give the album a name').max(80),
  occasion: z.enum(occasionIds).default('birthday'),
  familyId: uuid.optional().nullable().or(z.literal('')).transform((v) => v || null)
});

async function checkFamily(db: DB, userId: string, familyId: string | null) {
  if (!familyId) return;
  const m = await db.query.familyMembers.findFirst({ where: and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)) });
  if (!m || m.role === 'viewer') throw badRequest('You can only share albums with a family circle where you can add things');
}

export async function createAlbum(db: DB, userId: string, raw: unknown) {
  const input = albumSchema.parse(raw);
  await checkFamily(db, userId, input.familyId);
  const { plan } = await entitlements(db, userId);
  const [{ n }] = await db.select({ n: count() }).from(albums).where(eq(albums.userId, userId));
  if (n >= plan.maxAlbums) throw planLimit(`The ${plan.name} plan includes ${plan.maxAlbums} albums. Upgrade to Family for more.`);
  const [a] = await db.insert(albums).values({ ...input, userId, designIndex: defaultAlbumDesign(input.occasion) }).returning();
  return a;
}

/** Your albums and albums shared with your family circles, newest first, with a cover and photo count. */
export async function listAlbums(db: DB, userId: string) {
  const myCircles = db.select({ id: familyMembers.familyId }).from(familyMembers).where(eq(familyMembers.userId, userId));
  const list = await db.select({ a: albums, ownerName: users.name, familyName: families.name }).from(albums)
    .innerJoin(users, eq(users.id, albums.userId)).leftJoin(families, eq(families.id, albums.familyId))
    .where(or(eq(albums.userId, userId), inArray(albums.familyId, myCircles))).orderBy(desc(albums.createdAt));
  if (!list.length) return [];
  const ids = list.map((r) => r.a.id);
  const counts = await db.select({ albumId: albumPhotos.albumId, n: count() }).from(albumPhotos).where(inArray(albumPhotos.albumId, ids)).groupBy(albumPhotos.albumId);
  const firsts = await db.selectDistinctOn([albumPhotos.albumId], { albumId: albumPhotos.albumId, id: albumPhotos.id }).from(albumPhotos)
    .where(inArray(albumPhotos.albumId, ids)).orderBy(albumPhotos.albumId, asc(albumPhotos.sortOrder), asc(albumPhotos.createdAt));
  return list.map(({ a, ownerName, familyName }) => {
    const cover = a.coverPhotoId ?? firsts.find((f) => f.albumId === a.id)?.id ?? null;
    return { ...a, ownerName, familyName, isMine: a.userId === userId, photoCount: counts.find((c) => c.albumId === a.id)?.n ?? 0, coverUrl: cover ? mediaUrl(cover, 'thumb') : null };
  });
}

export async function getAlbum(db: DB, userId: string, id: string) {
  const { a, acc } = await loadAlbum(db, userId, id);
  const photos = await db.select({ p: albumPhotos, uploader: users.name }).from(albumPhotos).leftJoin(users, eq(users.id, albumPhotos.uploadedBy))
    .where(eq(albumPhotos.albumId, a.id)).orderBy(asc(albumPhotos.sortOrder), asc(albumPhotos.createdAt));
  const owner = await entitlements(db, a.userId);
  return { album: a, ...acc, photos: photos.map(({ p, uploader }) => ({ ...withUrls(p), uploader: uploader ?? p.guestName ?? 'Guest' })), maxPhotos: owner.plan.maxPhotosPerAlbum };
}

export const albumUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  occasion: z.enum(occasionIds).optional(),
  designIndex: z.coerce.number().int().min(0).max(ALBUM_DESIGNS - 1).optional(),
  familyId: uuid.nullable().optional(),
  shared: z.boolean().optional(),
  guestUploads: z.boolean().optional(),
  coverPhotoId: uuid.nullable().optional()
});

export async function updateAlbum(db: DB, userId: string, id: string, raw: unknown) {
  const { a, acc } = await loadAlbum(db, userId, id);
  if (!acc.isOwner) throw new AppError(403, 'forbidden', 'Only the person who made the album can change it');
  const { shared, ...input } = albumUpdateSchema.parse(raw);
  if (input.familyId !== undefined && input.familyId !== a.familyId) await checkFamily(db, userId, input.familyId);
  if (input.coverPhotoId) {
    const p = await db.query.albumPhotos.findFirst({ where: and(eq(albumPhotos.id, input.coverPhotoId), eq(albumPhotos.albumId, a.id)) });
    if (!p) throw badRequest('That photo isn’t in this album');
  }
  const patch: Partial<Album> = { ...input };
  if (shared === true && !a.slug) patch.slug = randomBytes(9).toString('base64url');
  if (shared === false) { patch.slug = null; patch.guestUploads = false; }
  if (input.guestUploads && !(a.slug || patch.slug)) throw badRequest('Share the album first');
  const [u] = await db.update(albums).set(patch).where(eq(albums.id, a.id)).returning();
  return u;
}

export async function deleteAlbum(db: DB, userId: string, id: string, storage: Storage = storageFromEnv()) {
  const { a, acc } = await loadAlbum(db, userId, id);
  if (!acc.isOwner) throw new AppError(403, 'forbidden', 'Only the person who made the album can delete it');
  const photos = await db.select().from(albumPhotos).where(eq(albumPhotos.albumId, a.id));
  await db.delete(albums).where(eq(albums.id, a.id));
  for (const p of photos) await Promise.all([storage.delete(p.fullKey), storage.delete(p.thumbKey)]).catch(() => undefined);
}

/* ---------------- Photos ---------------- */

/**
 * Checks the file really is an image, fixes its rotation, makes a large copy (max 2048px) and a thumbnail,
 * and drops all metadata — including GPS location — before anything is stored.
 */
export async function processImage(data: Buffer) {
  let meta: Metadata;
  try { meta = await sharp(data, { limitInputPixels: 60_000_000 }).metadata(); } catch { throw badRequest('That file isn’t a photo we can read (use JPG, PNG, WebP or GIF)'); }
  if (!meta.width || !meta.height) throw badRequest('That file isn’t a photo we can read');
  if (meta.format === 'heif') throw badRequest('iPhone HEIC photos aren’t supported yet — share them as JPG (Settings → Camera → Most Compatible)');
  const base = () => sharp(data, { limitInputPixels: 60_000_000, animated: false }).rotate();
  const full = await base().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await base().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

async function addPhotoTo(db: DB, a: Album, file: { data: Buffer; type: string }, by: { userId: string | null; guestName: string | null }, storage: Storage) {
  if (file.data.length > MAX_UPLOAD_BYTES) throw badRequest('Photos can be up to 15 MB');
  if (file.type && !ACCEPTED.includes(file.type) && !file.type.startsWith('image/')) throw badRequest('Upload a photo (JPG, PNG, WebP or GIF)');
  const { plan } = await entitlements(db, a.userId);
  const [{ n }] = await db.select({ n: count() }).from(albumPhotos).where(eq(albumPhotos.albumId, a.id));
  if (n >= plan.maxPhotosPerAlbum) throw planLimit(`This album is full (${plan.maxPhotosPerAlbum} photos on the ${plan.name} plan).`);
  const img = await processImage(file.data);
  const id = randomUUID();
  const fullKey = `albums/${a.id}/${id}-full.webp`, thumbKey = `albums/${a.id}/${id}-thumb.webp`;
  await storage.put(fullKey, img.full, 'image/webp');
  await storage.put(thumbKey, img.thumb, 'image/webp');
  const [{ last }] = await db.select({ last: max(albumPhotos.sortOrder) }).from(albumPhotos).where(eq(albumPhotos.albumId, a.id));
  try {
    const [p] = await db.insert(albumPhotos).values({ id, albumId: a.id, uploadedBy: by.userId, guestName: by.guestName, fullKey, thumbKey, width: img.width, height: img.height, bytes: img.full.length, sortOrder: (last ?? -1) + 1 }).returning();
    return withUrls(p);
  } catch (e) {
    await Promise.all([storage.delete(fullKey), storage.delete(thumbKey)]).catch(() => undefined);
    throw e;
  }
}

export async function addPhoto(db: DB, userId: string, albumId: string, file: { data: Buffer; type: string }, storage: Storage = storageFromEnv()) {
  const { a, acc } = await loadAlbum(db, userId, albumId);
  if (!acc.canAdd) throw new AppError(403, 'forbidden', 'You can only view this album');
  return addPhotoTo(db, a, file, { userId, guestName: null }, storage);
}

export const captionSchema = z.object({ caption: z.string().trim().max(200).nullable().optional().transform((v) => v || null), sortOrder: z.coerce.number().int().min(0).max(100000).optional() });

async function loadPhoto(db: DB, userId: string, photoId: string) {
  if (!uuid.safeParse(photoId).success) throw notFound('Photo not found');
  const p = await db.query.albumPhotos.findFirst({ where: eq(albumPhotos.id, photoId) });
  if (!p) throw notFound('Photo not found');
  const { a, acc } = await loadAlbum(db, userId, p.albumId);
  return { p, a, acc, mine: p.uploadedBy === userId };
}

/** The album owner can edit any photo; others can edit the photos they added. */
export async function updatePhoto(db: DB, userId: string, photoId: string, raw: unknown) {
  const { p, acc, mine } = await loadPhoto(db, userId, photoId);
  if (!acc.isOwner && !mine) throw new AppError(403, 'forbidden', 'You can only change photos you added');
  const input = captionSchema.parse(raw);
  const [u] = await db.update(albumPhotos).set(input).where(eq(albumPhotos.id, p.id)).returning();
  return withUrls(u);
}

export async function deletePhoto(db: DB, userId: string, photoId: string, storage: Storage = storageFromEnv()) {
  const { p, a, acc, mine } = await loadPhoto(db, userId, photoId);
  if (!acc.isOwner && !mine) throw new AppError(403, 'forbidden', 'You can only remove photos you added');
  await db.delete(albumPhotos).where(eq(albumPhotos.id, p.id));
  if (a.coverPhotoId === p.id) await db.update(albums).set({ coverPhotoId: null }).where(eq(albums.id, a.id));
  await Promise.all([storage.delete(p.fullKey), storage.delete(p.thumbKey)]).catch(() => undefined);
}

/* ---------------- Public album (shared link) ---------------- */

const slugOk = (s: string) => /^[A-Za-z0-9_-]{6,40}$/.test(s);

export async function getPublicAlbum(db: DB, slug: string) {
  if (!slugOk(slug)) throw notFound('Album not found');
  const [row] = await db.select({ a: albums, ownerName: users.name }).from(albums).innerJoin(users, eq(users.id, albums.userId)).where(and(eq(albums.slug, slug), isNotNull(albums.slug)));
  if (!row) throw notFound('Album not found');
  const photos = await db.select().from(albumPhotos).where(eq(albumPhotos.albumId, row.a.id)).orderBy(asc(albumPhotos.sortOrder), asc(albumPhotos.createdAt));
  return { album: row.a, ownerName: row.ownerName, photos: photos.map(withUrls) };
}

export const guestSchema = z.object({ name: z.string().trim().min(1, 'Add your name').max(60) });

/** Guests (no account) add photos to a shared album when the owner allows it. */
export async function addGuestPhoto(db: DB, slug: string, rawName: unknown, file: { data: Buffer; type: string }, storage: Storage = storageFromEnv()) {
  const { name } = guestSchema.parse({ name: rawName });
  const { album } = await getPublicAlbum(db, slug);
  if (!album.guestUploads) throw new AppError(403, 'closed', 'This album isn’t accepting photos');
  return addPhotoTo(db, album, file, { userId: null, guestName: name }, storage);
}

/** For the media route: the photo's stored file, if the link's signature matched. */
export async function photoFile(db: DB, photoId: string, variant: 'full' | 'thumb', storage: Storage = storageFromEnv()) {
  if (!uuid.safeParse(photoId).success) return null;
  const p = await db.query.albumPhotos.findFirst({ where: eq(albumPhotos.id, photoId) });
  if (!p) return null;
  return storage.get(variant === 'full' ? p.fullKey : p.thumbKey);
}

