import { randomUUID } from 'node:crypto';
import sharp, { type OutputInfo } from 'sharp';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { cardDrafts, files, wishes } from '../schema';
import { AppError, badRequest, notFound } from '../errors';
import { fileUrl, storageFromEnv, type Storage } from '../providers/storage';
import { processImage } from './albums';
import { docSchema, fileIdsIn, initialDoc, type CardDoc } from '@/lib/card-doc';
import { GREETINGS, LANGUAGES, OCCASIONS, type OccasionId } from '@/lib/i18n-data';

const uuid = z.string().uuid();
export const MAX_DESIGNS = 200;
export const MAX_CARD_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_RENDER_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_MESSAGE_SECONDS = 120;

export type Design = typeof cardDrafts.$inferSelect;
export type StoredFile = typeof files.$inferSelect;

const occasionIds = OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]];
const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];

/** What the editor needs: the document plus signed links for every file it uses. */
function view(d: Design) {
  const doc = JSON.parse(d.doc) as CardDoc;
  const urls: Record<string, string> = {};
  for (const id of fileIdsIn(doc)) urls[id] = fileUrl(id);
  return {
    id: d.id, title: d.title, occasion: d.occasion, favourite: d.favourite, doc, urls,
    frontUrl: d.frontFileId ? fileUrl(d.frontFileId) : null,
    insideUrl: d.insideFileId ? fileUrl(d.insideFileId) : null,
    createdAt: d.createdAt, updatedAt: d.updatedAt
  };
}
export type DesignView = ReturnType<typeof view>;

async function load(db: DB, userId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound('Card not found');
  const d = await db.query.cardDrafts.findFirst({ where: and(eq(cardDrafts.id, id), eq(cardDrafts.userId, userId)) });
  if (!d) throw notFound('Card not found');
  return d;
}

async function checkCount(db: DB, userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(cardDrafts).where(eq(cardDrafts.userId, userId));
  if (n >= MAX_DESIGNS) throw badRequest(`You can keep up to ${MAX_DESIGNS} cards — delete some you don’t need`);
}

export const createSchema = z.object({
  occasion: z.enum(occasionIds),
  designIndex: z.coerce.number().int().min(0).max(249).default(0),
  language: z.enum(languageCodes).default('en'),
  to: z.string().trim().max(80).optional(),
  from: z.string().trim().max(80).optional(),
  message: z.string().trim().max(600).optional(),
  title: z.string().trim().max(80).optional()
});

export async function createDesign(db: DB, userId: string, raw: unknown) {
  const input = createSchema.parse(raw);
  await checkCount(db, userId);
  const greeting = GREETINGS[input.occasion]?.[input.language as keyof (typeof GREETINGS)[OccasionId]] ?? GREETINGS[input.occasion].en;
  const doc = initialDoc({ occasion: input.occasion, designIndex: input.designIndex, greeting, to: input.to || undefined, from: input.from || undefined, message: input.message || undefined, language: input.language });
  const label = OCCASIONS.find((o) => o.id === input.occasion)!.label;
  const title = input.title || (input.to ? `${label} card for ${input.to}` : `${label} card`);
  const [d] = await db.insert(cardDrafts).values({ userId, title, occasion: input.occasion, doc: JSON.stringify(doc) }).returning();
  return view(d);
}

export async function listDesigns(db: DB, userId: string) {
  const rows = await db.select().from(cardDrafts).where(eq(cardDrafts.userId, userId)).orderBy(desc(cardDrafts.favourite), desc(cardDrafts.updatedAt)).limit(MAX_DESIGNS);
  return rows.map((d) => ({ id: d.id, title: d.title, occasion: d.occasion, favourite: d.favourite, updatedAt: d.updatedAt, frontUrl: d.frontFileId ? fileUrl(d.frontFileId) : null, doc: JSON.parse(d.doc) as CardDoc }));
}

export async function getDesign(db: DB, userId: string, id: string) {
  return view(await load(db, userId, id));
}

export const updateSchema = z.object({
  title: z.string().trim().min(1, 'Give the card a name').max(80).optional(),
  favourite: z.boolean().optional(),
  doc: docSchema.optional()
});

/** Saves edits. Every photo the card uses must be one you uploaded. */
export async function updateDesign(db: DB, userId: string, id: string, raw: unknown) {
  const d = await load(db, userId, id);
  const input = updateSchema.parse(raw);
  const patch: Partial<Design> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.favourite !== undefined) patch.favourite = input.favourite;
  if (input.doc) {
    const ids = fileIdsIn(input.doc);
    if (ids.length) {
      const mine = await db.select({ id: files.id }).from(files).where(and(eq(files.ownerId, userId), inArray(files.id, ids), eq(files.kind, 'card-photo')));
      if (mine.length !== ids.length) throw badRequest('That card uses a photo that isn’t yours');
    }
    const json = JSON.stringify(input.doc);
    if (json.length > 400_000) throw badRequest('This card has too much on it');
    patch.doc = json;
    const bg = input.doc.pages[0].background;
    if (bg.kind === 'design') patch.occasion = bg.occasion;
  }
  const [u] = await db.update(cardDrafts).set(patch).where(eq(cardDrafts.id, d.id)).returning();
  return view(u);
}

export async function duplicateDesign(db: DB, userId: string, id: string) {
  const d = await load(db, userId, id);
  await checkCount(db, userId);
  const [c] = await db.insert(cardDrafts).values({ userId, title: `${d.title} (copy)`.slice(0, 80), occasion: d.occasion, doc: d.doc }).returning();
  return view(c);
}

/** Deletes a card and its finished images. Photos stay (other cards may use them) until the account is deleted. */
export async function deleteDesign(db: DB, userId: string, id: string, storage: Storage = storageFromEnv()) {
  const d = await load(db, userId, id);
  await db.delete(cardDrafts).where(eq(cardDrafts.id, d.id));
  await removeFiles(db, [d.frontFileId, d.insideFileId].filter((x): x is string => !!x), storage);
}

async function removeFiles(db: DB, ids: string[], storage: Storage) {
  if (!ids.length) return;
  const rows = await db.select().from(files).where(inArray(files.id, ids));
  // Keep files a sent wish still points at.
  const used = new Set((await db.select({ id: wishes.messageFileId }).from(wishes).where(inArray(wishes.messageFileId, ids))).map((r) => r.id));
  const gone = rows.filter((f) => !used.has(f.id));
  if (!gone.length) return;
  await db.delete(files).where(inArray(files.id, gone.map((f) => f.id)));
  await Promise.all(gone.map((f) => storage.delete(f.key).catch(() => undefined)));
}

async function store(db: DB, row: Omit<typeof files.$inferInsert, 'id' | 'key'> & { ext: string }, data: Buffer, storage: Storage) {
  const id = randomUUID();
  const key = `files/${row.ownerId}/${id}.${row.ext}`;
  await storage.put(key, data, row.mime);
  try {
    const [f] = await db.insert(files).values({ id, key, ownerId: row.ownerId, kind: row.kind, mime: row.mime, bytes: data.length, width: row.width ?? null, height: row.height ?? null, durationSec: row.durationSec ?? null }).returning();
    return f;
  } catch (e) {
    await storage.delete(key).catch(() => undefined);
    throw e;
  }
}

/** A photo for a card (background or a picture layer). Rotated, resized and stripped of location data like album photos. */
export async function addCardPhoto(db: DB, userId: string, file: { data: Buffer; type: string }, storage: Storage = storageFromEnv()) {
  if (file.data.length > MAX_CARD_PHOTO_BYTES) throw badRequest('Photos can be up to 15 MB');
  if (file.type && !file.type.startsWith('image/')) throw badRequest('Upload a photo (JPG, PNG, WebP or GIF)');
  const [{ n }] = await db.select({ n: count() }).from(files).where(and(eq(files.ownerId, userId), eq(files.kind, 'card-photo')));
  if (n >= 1000) throw badRequest('You’ve uploaded the most card photos we can keep (1,000)');
  // Keep transparency (for cut-out pictures) by storing PNG-like WebP with alpha.
  const img = await processImage(file.data);
  const f = await store(db, { ownerId: userId, kind: 'card-photo', mime: 'image/webp', ext: 'webp', bytes: 0, width: img.width, height: img.height }, img.full, storage);
  return { id: f.id, url: fileUrl(f.id), width: img.width, height: img.height };
}

/**
 * Saves the finished picture of one page (drawn in the browser). This is what the wish page,
 * social previews and printing use, so the card looks exactly as designed.
 */
export async function setRender(db: DB, userId: string, id: string, page: 'front' | 'inside', data: Buffer, storage: Storage = storageFromEnv()) {
  const d = await load(db, userId, id);
  if (data.length > MAX_RENDER_BYTES) throw badRequest('That card image is too large');
  let out: { data: Buffer; info: OutputInfo };
  try {
    const meta = await sharp(data, { limitInputPixels: 12_000_000 }).metadata();
    if (meta.format !== 'png' && meta.format !== 'jpeg' && meta.format !== 'webp') throw new Error('format');
    if (!meta.width || !meta.height || Math.abs(meta.width / meta.height - 0.75) > 0.02) throw new Error('shape');
    out = await sharp(data, { limitInputPixels: 12_000_000 }).resize({ width: 1500, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest('That isn’t a card image we can use');
  }
  const f = await store(db, { ownerId: userId, kind: 'card-render', mime: 'image/webp', ext: 'webp', bytes: 0, width: out.info.width, height: out.info.height }, out.data, storage);
  const old = page === 'front' ? d.frontFileId : d.insideFileId;
  await db.update(cardDrafts).set(page === 'front' ? { frontFileId: f.id } : { insideFileId: f.id }).where(eq(cardDrafts.id, d.id));
  if (old) await removeFiles(db, [old], storage);
  return { id: f.id, url: fileUrl(f.id) };
}

/* ---------------- Voice and video messages ---------------- */

/** Recognises the container from its first bytes, so a renamed file can’t pretend to be audio. */
export function sniffMedia(b: Buffer): { mime: string; ext: string; video: boolean } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', ext: 'webm', video: true }; // WebM (audio or video)
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    return brand.startsWith('M4A') ? { mime: 'audio/mp4', ext: 'm4a', video: false } : { mime: 'video/mp4', ext: 'mp4', video: true };
  }
  if (b.toString('latin1', 0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg', video: false };
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3', video: false };
  return null;
}

export async function addMessageRecording(db: DB, userId: string, file: { data: Buffer; type: string; durationSec: number }, storage: Storage = storageFromEnv()) {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null;
  if (!kind) throw badRequest('Record a voice or video message');
  const sniffed = sniffMedia(file.data);
  if (!sniffed) throw badRequest('That recording format isn’t supported');
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
  if (file.data.length > limit) throw badRequest(kind === 'video' ? 'Video messages can be up to 40 MB' : 'Voice messages can be up to 8 MB');
  const duration = Math.round(file.durationSec);
  if (!Number.isFinite(duration) || duration < 1) throw badRequest('That recording is empty');
  if (duration > MAX_MESSAGE_SECONDS) throw badRequest('Messages can be up to 2 minutes');
  // WebM and MP4 can hold audio only; keep the type the browser told us so it plays as audio.
  const mime = kind === 'audio' && sniffed.mime.startsWith('video/') ? sniffed.mime.replace('video/', 'audio/') : sniffed.mime;
  const f = await store(db, { ownerId: userId, kind: `message-${kind}`, mime, ext: sniffed.ext, bytes: 0, durationSec: duration }, file.data, storage);
  return { id: f.id, url: fileUrl(f.id), kind, durationSec: duration, mime };
}

/** Reads a stored file for the signed-link route. */
export async function fileData(db: DB, id: string, storage: Storage = storageFromEnv()) {
  if (!uuid.safeParse(id).success) return null;
  const f = await db.query.files.findFirst({ where: eq(files.id, id) });
  if (!f) return null;
  const data = await storage.get(f.key);
  return data ? { data, mime: f.mime } : null;
}

/** Checks a design and a recording belong to the person attaching them to a wish. */
export async function checkWishAttachments(db: DB, userId: string, a: { cardDraftId?: string | null; messageFileId?: string | null }) {
  if (a.cardDraftId) await load(db, userId, a.cardDraftId);
  if (a.messageFileId) {
    const f = uuid.safeParse(a.messageFileId).success ? await db.query.files.findFirst({ where: and(eq(files.id, a.messageFileId), eq(files.ownerId, userId)) }) : null;
    if (!f || !f.kind.startsWith('message-')) throw new AppError(400, 'bad_file', 'That recording isn’t available');
  }
}

/** For the wish page: the card images and the recording, with signed links. */
export async function wishMedia(db: DB, w: { cardDraftId: string | null; messageFileId: string | null }) {
  const card = w.cardDraftId ? await db.query.cardDrafts.findFirst({ where: eq(cardDrafts.id, w.cardDraftId) }) : null;
  const msg = w.messageFileId ? await db.query.files.findFirst({ where: eq(files.id, w.messageFileId) }) : null;
  return {
    card: card?.frontFileId ? { frontUrl: fileUrl(card.frontFileId), insideUrl: card.insideFileId ? fileUrl(card.insideFileId) : null } : null,
    message: msg ? { url: fileUrl(msg.id), kind: msg.kind === 'message-video' ? 'video' as const : 'audio' as const, mime: msg.mime, durationSec: msg.durationSec ?? 0 } : null
  };
}
