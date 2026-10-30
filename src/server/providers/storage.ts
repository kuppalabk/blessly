import { cfg } from '../settings';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Where photos live: the local disk (default) or any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2…). */
export interface Storage {
  name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const safeKey = (key: string) => {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Bad storage key');
  return key;
};

export class LocalStorage implements Storage {
  name = 'local';
  constructor(private dir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')) {}
  async put(key: string, data: Buffer) {
    const file = path.join(this.dir, safeKey(key));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  async get(key: string) {
    try { return await readFile(path.join(this.dir, safeKey(key))); } catch { return null; }
  }
  async delete(key: string) { await rm(path.join(this.dir, safeKey(key)), { force: true }); }
}

export class S3Storage implements Storage {
  name = 's3';
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: cfg('S3_REGION') || 'auto',
      endpoint: cfg('S3_ENDPOINT') || undefined,
      forcePathStyle: !!cfg('S3_ENDPOINT'),
      credentials: cfg('S3_ACCESS_KEY_ID') ? { accessKeyId: cfg('S3_ACCESS_KEY_ID') ?? '', secretAccessKey: cfg('S3_SECRET_ACCESS_KEY') ?? '' } : undefined
    });
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType, CacheControl: 'private, max-age=31536000, immutable' }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
    } catch { return null; }
  }
  async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) })); }
}

// Rebuilt whenever the storage settings change (the admin can switch from disk to S3 at any time).
let cached: Storage | null = null;
let cachedSig = '';
export function storageFromEnv(): Storage {
  const sig = [cfg('S3_BUCKET'), cfg('S3_ENDPOINT'), cfg('S3_REGION'), cfg('S3_ACCESS_KEY_ID'), cfg('S3_SECRET_ACCESS_KEY')].join('|');
  if (!cached || sig !== cachedSig) {
    cachedSig = sig;
    cached = cfg('S3_BUCKET') ? new S3Storage(cfg('S3_BUCKET') ?? '') : new LocalStorage();
  }
  return cached;
}

/* Photo links are signed so only people shown the album can load its photos. */

function mediaSecret() {
  const s = cfg('MEDIA_SIGNING_SECRET') || process.env.ENCRYPTION_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('Set MEDIA_SIGNING_SECRET (or ENCRYPTION_KEY) to serve photos');
  return 'dev-only-media-secret';
}

export function signMedia(photoId: string, variant: 'full' | 'thumb') {
  return createHmac('sha256', mediaSecret()).update(`${photoId}:${variant}`).digest('base64url').slice(0, 32);
}

export function mediaUrl(photoId: string, variant: 'full' | 'thumb') {
  return `/api/media/${photoId}/${variant}?t=${signMedia(photoId, variant)}`;
}

export function validMediaSignature(photoId: string, variant: 'full' | 'thumb', t: string) {
  const a = Buffer.from(signMedia(photoId, variant)), b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Editor files (card photos, finished card images, voice/video messages) use the same kind of signed link. */
export function signFile(fileId: string) {
  return createHmac('sha256', mediaSecret()).update(`file:${fileId}`).digest('base64url').slice(0, 32);
}
export function fileUrl(fileId: string) {
  return `/api/files/${fileId}?t=${signFile(fileId)}`;
}
export function validFileSignature(fileId: string, t: string) {
  const a = Buffer.from(signFile(fileId)), b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}
