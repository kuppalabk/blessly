import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

/** 32-byte key from ENCRYPTION_KEY (base64). Create one with: openssl rand -base64 32 */
function key() {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new AppError(503, 'no_key', 'The server is missing ENCRYPTION_KEY, so it can’t store secrets (WhatsApp credentials, two-step verification keys) safely');
  return k;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(box: string) {
  const [v, iv, tag, data] = box.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function validMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  const [algo, sig] = (header ?? '').split('=');
  if (algo !== 'sha256' || !sig || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  const given = Buffer.from(sig, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
