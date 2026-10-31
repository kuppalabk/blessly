import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Authenticator-app codes (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) — works with Google Authenticator, 1Password, Authy… */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
export const stepAt = (t: number) => Math.floor(t / 30000);

export function hotp(secret: string, counter: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}

export const totp = (secret: string, t = Date.now()) => hotp(secret, stepAt(t));

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Returns the matched step so callers can refuse to accept the same code twice.
 */
export function verifyTotp(secret: string, code: string, t = Date.now(), lastStep: number | null = null): number | null {
  const c = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepAt(t);
  for (const s of [now - 1, now, now + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const a = Buffer.from(hotp(secret, s)), b = Buffer.from(c);
    if (timingSafeEqual(a, b)) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'Blessly') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
