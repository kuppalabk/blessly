import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { db, givePlan, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import {
  addGuestPhoto, addPhoto, createAlbum, deleteAlbum, deletePhoto, getAlbum, getPublicAlbum, listAlbums, photoFile, processImage, updateAlbum, updatePhoto
} from '@/server/services/albums';
import { acceptInvite, createFamily, createInvite } from '@/server/services/family';
import { deleteUserEverywhere } from '@/server/services/account';
import { mediaUrl, signMedia, validMediaSignature, type Storage } from '@/server/providers/storage';
import { albumDesign, ALBUM_DESIGNS } from '@/lib/albums';

beforeEach(resetDb);
afterAll(closeDb);

class MemoryStorage implements Storage {
  name = 'memory';
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.files.set(k, d); }
  async get(k: string) { return this.files.get(k) ?? null; }
  async delete(k: string) { this.files.delete(k); }
}

async function jpeg(w = 3000, h = 2000, withGps = false) {
  const plain = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
  if (!withGps) return plain;
  // A phone photo: taken sideways (orientation 6) with camera and GPS location in its EXIF data.
  return sharp(plain).withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '19/1 4/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '72/1 52/1 0/1' } }).jpeg().toBuffer();
}

describe('100 album designs', () => {
  it('are all different and named', () => {
    const names = new Set(Array.from({ length: ALBUM_DESIGNS }, (_, i) => albumDesign(i).name));
    expect(names.size).toBe(100);
    expect(albumDesign(100).index).toBe(0);
    expect(albumDesign(-1).index).toBe(99);
  });
});

describe('photo processing', () => {
  it('resizes, fixes rotation and removes location and camera data', async () => {
    const input = await jpeg(3000, 2000, true);
    expect((await sharp(input).metadata()).exif).toBeTruthy();
    const out = await processImage(input);
    expect(Math.max(out.width, out.height)).toBe(2048);
    expect(out.height).toBeGreaterThan(out.width); // orientation 6 = rotated 90°
    const meta = await sharp(out.full).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect((await sharp(out.thumb).metadata()).width).toBeLessThanOrEqual(600);
  });

  it('rejects files that aren’t images', async () => {
    await expect(processImage(Buffer.from('<script>alert(1)</script>'))).rejects.toThrow(/isn’t a photo/);
  });
});

describe('albums', () => {
  it('free accounts get 3 albums; Family gets more', async () => {
    const u = await makeUser();
    for (let i = 0; i < 3; i++) await createAlbum(db(), u.id, { title: `A${i}` });
    await expect(createAlbum(db(), u.id, { title: 'A4' })).rejects.toMatchObject({ status: 402, code: 'plan_limit' });
    await givePlan(u.id, 'family');
    await expect(createAlbum(db(), u.id, { title: 'A4' })).resolves.toBeTruthy();
  });

  it('uploads photos, stores two sizes, serves them by signed link, and enforces the photo limit', async () => {
    const store = new MemoryStorage();
    const u = await makeUser();
    const a = await createAlbum(db(), u.id, { title: 'Diwali 2026', occasion: 'diwali' });
    expect(albumDesign(a.designIndex).theme.id).toBe('saffron');
    const p = await addPhoto(db(), u.id, a.id, { data: await jpeg(800, 600), type: 'image/jpeg' }, store);
    expect(store.files.size).toBe(2);
    expect(p.thumbUrl).toBe(mediaUrl(p.id, 'thumb'));
    expect(validMediaSignature(p.id, 'thumb', signMedia(p.id, 'thumb'))).toBe(true);
    expect(validMediaSignature(p.id, 'full', signMedia(p.id, 'thumb'))).toBe(false);
    expect(await photoFile(db(), p.id, 'full', store)).toBeInstanceOf(Buffer);
    await expect(addPhoto(db(), u.id, a.id, { data: Buffer.alloc(16 * 1024 * 1024), type: 'image/jpeg' }, store)).rejects.toThrow(/15 MB/);
    // Free plan: 50 photos per album.
    await db().execute(`insert into album_photos (album_id, full_key, thumb_key, width, height, bytes) select '${a.id}', 'k', 'k', 1, 1, 1 from generate_series(1, 49)` as never);
    await expect(addPhoto(db(), u.id, a.id, { data: await jpeg(100, 100), type: 'image/jpeg' }, store)).rejects.toMatchObject({ code: 'plan_limit' });
  });

  it('family members of a shared album can view and add; viewers only view; strangers get 404', async () => {
    const store = new MemoryStorage();
    const owner = await makeUser({ name: 'Kiran' });
    const fam = await createFamily(db(), owner.id, { name: 'F' });
    const member = await makeUser({ name: 'Aarav' });
    const viewer = await makeUser();
    await acceptInvite(db(), member.id, (await createInvite(db(), owner.id, fam.id, { role: 'member' })).token);
    await acceptInvite(db(), viewer.id, (await createInvite(db(), owner.id, fam.id, { role: 'viewer' })).token);
    const a = await createAlbum(db(), owner.id, { title: 'Dadi 80', familyId: fam.id });
    const mine = await addPhoto(db(), member.id, a.id, { data: await jpeg(400, 300), type: 'image/jpeg' }, store);
    expect((await getAlbum(db(), owner.id, a.id)).photos[0].uploader).toBe('Aarav');
    expect((await listAlbums(db(), member.id)).map((x) => [x.title, x.isMine, x.photoCount])).toEqual([['Dadi 80', false, 1]]);
    await expect(addPhoto(db(), viewer.id, a.id, { data: await jpeg(400, 300), type: 'image/jpeg' }, store)).rejects.toMatchObject({ status: 403 });
    await expect(updateAlbum(db(), member.id, a.id, { title: 'Hijack' })).rejects.toMatchObject({ status: 403 });
    await expect(updatePhoto(db(), member.id, mine.id, { caption: 'Cake time' })).resolves.toMatchObject({ caption: 'Cake time' });
    const stranger = await makeUser();
    await expect(getAlbum(db(), stranger.id, a.id)).rejects.toMatchObject({ status: 404 });
    await expect(deletePhoto(db(), viewer.id, mine.id, store)).rejects.toMatchObject({ status: 403 });
    await deletePhoto(db(), owner.id, mine.id, store);
    expect(store.files.size).toBe(0);
  });

  it('shares by link, lets guests add photos only when allowed, and stops when unshared', async () => {
    const store = new MemoryStorage();
    const u = await makeUser();
    const a = await createAlbum(db(), u.id, { title: 'Wedding' });
    await expect(updateAlbum(db(), u.id, a.id, { guestUploads: true })).rejects.toThrow(/Share the album first/);
    const shared = await updateAlbum(db(), u.id, a.id, { shared: true, designIndex: 57 });
    expect(shared.slug).toMatch(/^[\w-]{12}$/);
    expect((await getPublicAlbum(db(), shared.slug!)).album.designIndex).toBe(57);
    await expect(addGuestPhoto(db(), shared.slug!, 'Guest', { data: await jpeg(300, 300), type: 'image/jpeg' }, store)).rejects.toMatchObject({ status: 403 });
    await updateAlbum(db(), u.id, a.id, { guestUploads: true });
    await expect(addGuestPhoto(db(), shared.slug!, '', { data: await jpeg(300, 300), type: 'image/jpeg' }, store)).rejects.toThrow(/name/);
    await addGuestPhoto(db(), shared.slug!, 'Auntie Meena', { data: await jpeg(300, 300), type: 'image/jpeg' }, store);
    expect((await getAlbum(db(), u.id, a.id)).photos[0].uploader).toBe('Auntie Meena');
    await updateAlbum(db(), u.id, a.id, { shared: false });
    await expect(getPublicAlbum(db(), shared.slug!)).rejects.toMatchObject({ status: 404 });
  });

  it('deleting an album or the account removes the photo files', async () => {
    const store = new MemoryStorage();
    const u = await makeUser();
    const a = await createAlbum(db(), u.id, { title: 'A' });
    const b = await createAlbum(db(), u.id, { title: 'B' });
    await addPhoto(db(), u.id, a.id, { data: await jpeg(200, 200), type: 'image/jpeg' }, store);
    await addPhoto(db(), u.id, b.id, { data: await jpeg(200, 200), type: 'image/jpeg' }, store);
    await deleteAlbum(db(), u.id, a.id, store);
    expect(store.files.size).toBe(2);
    await deleteUserEverywhere(db(), u.id, store);
    expect(store.files.size).toBe(0);
  });
});
