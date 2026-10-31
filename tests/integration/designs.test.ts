import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { fileUrl, validFileSignature, type Storage } from '@/server/providers/storage';
import { addCardPhoto, addMessageRecording, createDesign, deleteDesign, duplicateDesign, fileData, getDesign, listDesigns, setRender, sniffMedia, updateDesign, wishMedia } from '@/server/services/designs';
import { getPublicWishPage, publishWishPage, saveWish } from '@/server/services/wishes';
import { deleteUserEverywhere } from '@/server/services/account';
import { files } from '@/server/schema';
import { docSchema, initialDoc } from '@/lib/card-doc';

beforeEach(resetDb);
afterAll(closeDb);

class MemoryStorage implements Storage {
  name = 'memory';
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.files.set(k, d); }
  async get(k: string) { return this.files.get(k) ?? null; }
  async delete(k: string) { this.files.delete(k); }
}

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: '#ff8800' } }).png().toBuffer();
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 1)]);

describe('card editor', () => {
  it('starts a card from a design with the greeting in the chosen language, then saves edits', async () => {
    const u = await makeUser();
    const d = await createDesign(db(), u.id, { occasion: 'diwali', designIndex: 7, language: 'hi', to: 'Dadi', from: 'Asha' });
    expect(d.title).toBe('Diwali card for Dadi');
    expect(d.doc.pages[0].background).toEqual({ kind: 'design', occasion: 'diwali', index: 7 });
    const texts = d.doc.pages[0].layers.map((l) => (l.type === 'text' ? l.text : ''));
    expect(texts).toContain('Dadi');
    expect(texts.some((t) => /दीपावली|दिवाली/.test(t))).toBe(true);
    expect(d.doc.pages[1].layers.some((l) => l.type === 'text' && l.text.includes('Asha'))).toBe(true);

    const doc = structuredClone(d.doc);
    doc.pages[0].layers.push({ type: 'sticker', id: 'abcd12', x: 0.2, y: 0.2, w: 0.15, rot: 15, emoji: '🪔' });
    doc.pages[1].background = { kind: 'color', color: '#ffe4ec', color2: '#fff3c4' };
    const saved = await updateDesign(db(), u.id, d.id, { doc, title: 'For Dadi', favourite: true });
    expect(saved.title).toBe('For Dadi');
    expect(saved.doc.pages[0].layers).toHaveLength(3);
    expect((await listDesigns(db(), u.id))[0].favourite).toBe(true);
  });

  it('rejects bad documents, other people’s photos and cards', async () => {
    const u = await makeUser(), other = await makeUser();
    const store = new MemoryStorage();
    const d = await createDesign(db(), u.id, { occasion: 'birthday' });
    const bad = structuredClone(d.doc) as any;
    bad.pages[0].layers.push({ type: 'qr', id: 'qr0001', x: 0.5, y: 0.5, w: 0.2, rot: 0, url: 'javascript:alert(1)', color: '#000000', bg: '#ffffff' });
    await expect(updateDesign(db(), u.id, d.id, { doc: bad })).rejects.toThrow();
    const drawing = structuredClone(d.doc) as any;
    drawing.pages[0].layers.push({ type: 'drawing', id: 'dr0001', x: 0.5, y: 0.5, w: 0.3, rot: 0, path: 'M0 0 L1 1"/><script>', ratio: 1, color: '#000000', stroke: 2 });
    await expect(updateDesign(db(), u.id, d.id, { doc: drawing })).rejects.toThrow();
    // A photo someone else uploaded can't be put on your card.
    const theirs = await addCardPhoto(db(), other.id, { data: await png(300, 200), type: 'image/png' }, store);
    const withPhoto = structuredClone(d.doc);
    withPhoto.pages[0].background = { kind: 'photo', fileId: theirs.id, zoom: 1, ox: 0, oy: 0 };
    await expect(updateDesign(db(), u.id, d.id, { doc: withPhoto })).rejects.toThrow(/isn’t yours/);
    const mine = await addCardPhoto(db(), u.id, { data: await png(300, 200), type: 'image/png' }, store);
    withPhoto.pages[0].background = { kind: 'photo', fileId: mine.id, zoom: 1.5, ox: 0.2, oy: 0 };
    const ok = await updateDesign(db(), u.id, d.id, { doc: withPhoto });
    expect(ok.urls[mine.id]).toBe(fileUrl(mine.id));
    await expect(getDesign(db(), other.id, d.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateDesign(db(), other.id, d.id, { title: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('stores the finished card picture, shows it on the wish page, and cleans up', async () => {
    const u = await makeUser();
    const store = new MemoryStorage();
    const d = await createDesign(db(), u.id, { occasion: 'birthday', to: 'Riya' });
    await expect(setRender(db(), u.id, d.id, 'front', await png(800, 400), store)).rejects.toThrow(/card image/);
    await expect(setRender(db(), u.id, d.id, 'front', Buffer.from('not an image'), store)).rejects.toThrow(/card image/);
    const first = await setRender(db(), u.id, d.id, 'front', await png(900, 1200), store);
    const second = await setRender(db(), u.id, d.id, 'front', await png(900, 1200), store);
    await setRender(db(), u.id, d.id, 'inside', await png(900, 1200), store);
    expect(await fileData(db(), first.id, store)).toBeNull(); // replaced render removed
    expect((await fileData(db(), second.id, store))!.mime).toBe('image/webp');

    const rec = await addMessageRecording(db(), u.id, { data: webm(), type: 'audio/webm;codecs=opus', durationSec: 12.4 }, store);
    expect(rec).toMatchObject({ kind: 'audio', durationSec: 12, mime: 'audio/webm' });
    const w = await saveWish(db(), u.id, { occasion: 'birthday', language: 'en', tone: 'heartfelt', text: 'Happy birthday!', recipientName: 'Riya', senderName: 'Me', cardDraftId: d.id, messageFileId: rec.id });
    const page = await publishWishPage(db(), u.id, w.id);
    const pub = await getPublicWishPage(db(), page.slug, false);
    const media = await wishMedia(db(), pub.wish);
    expect(media.card!.frontUrl).toBe(fileUrl(second.id));
    expect(media.message).toMatchObject({ kind: 'audio', durationSec: 12 });
    expect(validFileSignature(rec.id, new URL(media.message!.url, 'http://x').searchParams.get('t')!)).toBe(true);
    expect(validFileSignature(rec.id, 'forged')).toBe(false);

    // Someone else can't attach your card or recording to their wish.
    const other = await makeUser();
    await expect(saveWish(db(), other.id, { occasion: 'birthday', language: 'en', tone: 'heartfelt', text: 'Hi', recipientName: 'A', senderName: 'B', cardDraftId: d.id })).rejects.toMatchObject({ status: 404 });
    await expect(saveWish(db(), other.id, { occasion: 'birthday', language: 'en', tone: 'heartfelt', text: 'Hi', recipientName: 'A', senderName: 'B', messageFileId: rec.id })).rejects.toThrow(/recording/);

    const copy = await duplicateDesign(db(), u.id, d.id);
    expect(copy.title).toMatch(/\(copy\)$/);
    expect(copy.frontUrl).toBeNull();
    await deleteDesign(db(), u.id, d.id, store);
    expect(await fileData(db(), second.id, store)).toBeNull();
    expect((await wishMedia(db(), (await getPublicWishPage(db(), page.slug, false)).wish)).card).toBeNull(); // wish falls back to its numbered design
    // Deleting the account removes every stored file.
    await deleteUserEverywhere(db(), u.id, store);
    expect(store.files.size).toBe(0);
    expect(await db().select().from(files).where(eq(files.ownerId, u.id))).toEqual([]);
  });

  it('only accepts real recordings within the limits', async () => {
    const u = await makeUser();
    const store = new MemoryStorage();
    await expect(addMessageRecording(db(), u.id, { data: Buffer.from('<html>hello world</html>'), type: 'audio/webm', durationSec: 5 }, store)).rejects.toThrow(/format/);
    await expect(addMessageRecording(db(), u.id, { data: webm(), type: 'text/html', durationSec: 5 }, store)).rejects.toThrow(/voice or video/);
    await expect(addMessageRecording(db(), u.id, { data: webm(), type: 'video/webm', durationSec: 500 }, store)).rejects.toThrow(/2 minutes/);
    await expect(addMessageRecording(db(), u.id, { data: webm(), type: 'video/webm', durationSec: 0 }, store)).rejects.toThrow(/empty/);
    expect(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(8)]))!.mime).toBe('audio/mp4');
    expect(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(8)]))!.mime).toBe('video/mp4');
    expect((await addMessageRecording(db(), u.id, { data: webm(), type: 'video/webm', durationSec: 30 }, store)).kind).toBe('video');
  });

  it('the starting document is always valid for every occasion and design layout', () => {
    for (const occasion of ['birthday', 'remembrance', 'hanukkah'] as const)
      for (let i = 0; i < 25; i++) expect(docSchema.safeParse(initialDoc({ occasion, designIndex: i * 10, greeting: 'Hello there', to: 'A', from: 'B' })).success).toBe(true);
  });
});
