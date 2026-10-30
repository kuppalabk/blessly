import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { and, eq, gt, isNotNull, lt, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { authChallenges, sessions, userIdentities, users } from '../schema';
import { AppError, badRequest } from '../errors';
import { decrypt, encrypt } from '../crypto';
import { newTotpSecret, otpauthUri, verifyTotp } from '../totp';
import { sendSms, smsProviderFromEnv, OutboxSms, type SmsProvider } from '../providers/sms';
import type { Claims, ProviderId } from '../oidc';
import { normalizePhone } from '@/lib/send-links';
import { isValidTimezone } from '@/lib/dates';
import { toPublic, type PublicUser } from './auth';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/* ---------------- Challenges (a short-lived step in signing in) ---------------- */

async function newChallenge(db: DB, row: { kind: string; userId?: string | null; phone?: string | null; code?: string | null }, now = new Date()) {
  const token = randomBytes(24).toString('base64url');
  const id = sha(token);
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, now));
  await db.insert(authChallenges).values({ id, kind: row.kind, userId: row.userId ?? null, phone: row.phone ?? null, codeHash: row.code ? sha(`${id}:${row.code}`) : null, expiresAt: new Date(now.getTime() + CODE_MINUTES * 60000) });
  return token;
}

async function loadChallenge(db: DB, token: string | null | undefined, kind: string, now = new Date()) {
  const expired = () => new AppError(401, 'expired', 'That code has expired. Start again.');
  if (!token || token.length > 100) throw expired();
  const c = await db.query.authChallenges.findFirst({ where: and(eq(authChallenges.id, sha(token)), eq(authChallenges.kind, kind), gt(authChallenges.expiresAt, now)) });
  if (!c) throw expired();
  if (c.attempts >= MAX_ATTEMPTS) { await db.delete(authChallenges).where(eq(authChallenges.id, c.id)); throw new AppError(429, 'too_many', 'Too many wrong codes. Start again.'); }
  return c;
}

async function wrongCode(db: DB, id: string): Promise<never> {
  await db.update(authChallenges).set({ attempts: (await db.query.authChallenges.findFirst({ where: eq(authChallenges.id, id) }))!.attempts + 1 }).where(eq(authChallenges.id, id));
  throw new AppError(401, 'bad_code', 'That code isn’t right');
}

/* ---------------- Text-message codes ---------------- */

/** Phone sign-in needs a real SMS provider — or SMS_DEV_CODES=1, which shows codes on screen (development and tests only). */
export const smsDevCodes = (provider: SmsProvider = smsProviderFromEnv()) => provider.name === 'outbox' && (process.env.NODE_ENV !== 'production' || process.env.SMS_DEV_CODES === '1');
export const phoneSignInAvailable = () => !(smsProviderFromEnv() instanceof OutboxSms) || smsDevCodes();

export function cleanPhone(raw: unknown, country = 'IN') {
  const p = normalizePhone(String(raw ?? ''), country);
  if (!p || !/^\d{8,15}$/.test(p)) throw new AppError(400, 'bad_phone', 'Enter your mobile number with the country code, e.g. +91 98765 43210');
  return `+${p}`;
}

async function sendCode(db: DB, provider: SmsProvider, phone: string, code: string) {
  await sendSms(db, provider, phone, `${code} is your Blessly code. It expires in ${CODE_MINUTES} minutes. Don’t share it with anyone.`);
}

/** Step 1 of adding a phone in Settings. */
export async function startPhoneVerify(db: DB, user: PublicUser, raw: unknown, provider: SmsProvider = smsProviderFromEnv()) {
  if (!phoneSignInAvailable()) throw new AppError(503, 'no_sms', 'Text messages aren’t set up on this server yet');
  const phone = cleanPhone((raw as { phone?: string })?.phone, user.country);
  const taken = await db.query.users.findFirst({ where: and(eq(users.phone, phone), ne(users.id, user.id)) });
  if (taken) throw badRequest('That number is already used by another account');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const token = await newChallenge(db, { kind: 'phone-verify', userId: user.id, phone, code });
  await sendCode(db, provider, phone, code);
  return { token, phone, ...(smsDevCodes(provider) ? { devCode: code } : {}) };
}

export async function confirmPhone(db: DB, user: PublicUser, token: string, code: string, now = new Date()) {
  const c = await loadChallenge(db, token, 'phone-verify', now);
  if (c.userId !== user.id) throw new AppError(401, 'expired', 'That code has expired. Start again.');
  if (!same(c.codeHash!, sha(`${c.id}:${String(code).trim()}`))) await wrongCode(db, c.id);
  await db.delete(authChallenges).where(eq(authChallenges.id, c.id));
  try {
    await db.update(users).set({ phone: c.phone, phoneVerifiedAt: now }).where(eq(users.id, user.id));
  } catch { throw badRequest('That number is already used by another account'); }
  return { phone: c.phone };
}

export async function removePhone(db: DB, user: PublicUser) {
  await ensureAnotherWay(db, user.id, 'phone');
  await db.update(users).set({ phone: null, phoneVerifiedAt: null }).where(eq(users.id, user.id));
}

/** Step 1 of signing in with a code. The answer is the same whether or not the number has an account. */
export async function startPhoneLogin(db: DB, raw: unknown, provider: SmsProvider = smsProviderFromEnv()) {
  if (!phoneSignInAvailable()) throw new AppError(503, 'no_sms', 'Sign-in by text message isn’t available yet');
  const { phone: rawPhone, country } = (raw ?? {}) as { phone?: string; country?: string };
  const phone = cleanPhone(rawPhone, typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : 'IN');
  const u = await db.query.users.findFirst({ where: and(eq(users.phone, phone), isNotNull(users.phoneVerifiedAt)) });
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const token = await newChallenge(db, { kind: 'phone-login', userId: u?.id ?? null, phone, code: u ? code : null });
  if (u) await sendCode(db, provider, phone, code);
  return { token, phone, ...(u && smsDevCodes(provider) ? { devCode: code } : {}) };
}

export async function verifyPhoneLogin(db: DB, token: string, code: string, now = new Date()) {
  const c = await loadChallenge(db, token, 'phone-login', now);
  if (!c.userId || !c.codeHash || !same(c.codeHash, sha(`${c.id}:${String(code).trim()}`))) await wrongCode(db, c.id);
  await db.delete(authChallenges).where(eq(authChallenges.id, c.id));
  const u = await db.query.users.findFirst({ where: eq(users.id, c.userId!) });
  if (!u || u.phone !== c.phone) throw new AppError(401, 'expired', 'That code has expired. Start again.');
  if (u.suspendedAt) throw new AppError(403, 'suspended', 'This account is suspended. Please contact support.');
  return toPublic(u);
}

/* ---------------- Two-step verification (authenticator app) ---------------- */

export async function startMfaSetup(db: DB, user: PublicUser) {
  const u = (await db.query.users.findFirst({ where: eq(users.id, user.id) }))!;
  if (u.totpEnabledAt) throw badRequest('Two-step verification is already on');
  const secret = newTotpSecret();
  await db.update(users).set({ totpSecret: encrypt(secret), totpLastStep: null }).where(eq(users.id, user.id));
  const uri = otpauthUri(secret, u.email);
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString('base64')}` };
}

function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex').replace(/(.{5})(.{5})/, '$1-$2'));
  return { codes, stored: JSON.stringify(codes.map((c) => sha(c))) };
}

export async function confirmMfaSetup(db: DB, user: PublicUser, code: string, now = new Date()) {
  const u = (await db.query.users.findFirst({ where: eq(users.id, user.id) }))!;
  if (u.totpEnabledAt) throw badRequest('Two-step verification is already on');
  if (!u.totpSecret) throw badRequest('Start the set-up again');
  const step = verifyTotp(decrypt(u.totpSecret), code, now.getTime());
  if (step === null) throw new AppError(401, 'bad_code', 'That code isn’t right — check the time on your phone is set automatically');
  const r = newRecoveryCodes();
  await db.update(users).set({ totpEnabledAt: now, totpLastStep: step, recoveryCodes: r.stored }).where(eq(users.id, user.id));
  return { recoveryCodes: r.codes };
}

/** Checks an authenticator code (or a one-time recovery code) for an account with two-step verification on. */
export async function checkSecondFactor(db: DB, userId: string, code: string, now = new Date()) {
  const u = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  if (!u.totpEnabledAt || !u.totpSecret) return true;
  const c = String(code ?? '').trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const step = verifyTotp(decrypt(u.totpSecret), c.replace(/\s/g, ''), now.getTime(), u.totpLastStep);
    if (step === null) return false;
    await db.update(users).set({ totpLastStep: step }).where(eq(users.id, u.id));
    return true;
  }
  const hashes = JSON.parse(u.recoveryCodes ?? '[]') as string[];
  const h = sha(c.toLowerCase());
  if (!hashes.includes(h)) return false;
  await db.update(users).set({ recoveryCodes: JSON.stringify(hashes.filter((x) => x !== h)) }).where(eq(users.id, u.id));
  return true;
}

export async function disableMfa(db: DB, user: PublicUser, code: string) {
  if (user.role === 'admin') throw new AppError(403, 'admin_mfa', 'Admins must keep two-step verification on');
  if (!(await checkSecondFactor(db, user.id, code))) throw new AppError(401, 'bad_code', 'That code isn’t right');
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: null }).where(eq(users.id, user.id));
}

export async function regenerateRecoveryCodes(db: DB, user: PublicUser, code: string) {
  if (!(await checkSecondFactor(db, user.id, code))) throw new AppError(401, 'bad_code', 'That code isn’t right');
  const r = newRecoveryCodes();
  await db.update(users).set({ recoveryCodes: r.stored }).where(eq(users.id, user.id));
  return { recoveryCodes: r.codes };
}

export async function recoveryCodesLeft(db: DB, userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return (JSON.parse(u?.recoveryCodes ?? '[]') as string[]).length;
}

/** After the first step of signing in: if two-step verification is on, a challenge is needed before a session. */
export async function needsSecondStep(db: DB, userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return !!u?.totpEnabledAt;
}
export const startMfaChallenge = (db: DB, userId: string) => newChallenge(db, { kind: 'mfa', userId });

export async function completeMfaChallenge(db: DB, token: string | undefined, code: string, now = new Date()) {
  const c = await loadChallenge(db, token, 'mfa', now);
  if (!(await checkSecondFactor(db, c.userId!, code, now))) await wrongCode(db, c.id);
  await db.delete(authChallenges).where(eq(authChallenges.id, c.id));
  const u = await db.query.users.findFirst({ where: eq(users.id, c.userId!) });
  if (!u || u.suspendedAt) throw new AppError(403, 'suspended', 'This account is suspended. Please contact support.');
  return toPublic(u);
}

/* ---------------- Google / Apple ---------------- */

const verified = (c: Claims) => c.email_verified === true || c.email_verified === 'true';

/**
 * Signs in (or up) with a verified Google/Apple identity. An existing account with the same verified email is linked.
 * With `linkTo`, the identity is added to the signed-in account (Settings → Sign-in options).
 */
export async function oauthSignIn(db: DB, providerId: ProviderId, claims: Claims, extra: { name?: string | null; timezone?: string; country?: string; linkTo?: string | null } = {}) {
  const existing = await db.query.userIdentities.findFirst({ where: and(eq(userIdentities.provider, providerId), eq(userIdentities.subject, claims.sub)) });
  const email = claims.email && verified(claims) ? claims.email.trim().toLowerCase() : null;
  if (extra.linkTo) {
    if (existing && existing.userId !== extra.linkTo) throw badRequest('That account is already linked to a different Blessly account');
    if (!existing) await db.insert(userIdentities).values({ userId: extra.linkTo, provider: providerId, subject: claims.sub, email });
    const u = (await db.query.users.findFirst({ where: eq(users.id, extra.linkTo) }))!;
    return { user: toPublic(u), created: false, linked: !existing };
  }
  if (existing) {
    const u = await db.query.users.findFirst({ where: eq(users.id, existing.userId) });
    if (!u) throw new AppError(401, 'oidc', 'Sign-in failed');
    if (u.suspendedAt) throw new AppError(403, 'suspended', 'This account is suspended. Please contact support.');
    return { user: toPublic(u), created: false, linked: false };
  }
  if (!email) throw badRequest('Share your email address with Blessly to create an account');
  const byEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (byEmail) {
    if (byEmail.suspendedAt) throw new AppError(403, 'suspended', 'This account is suspended. Please contact support.');
    await db.insert(userIdentities).values({ userId: byEmail.id, provider: providerId, subject: claims.sub, email });
    return { user: toPublic(byEmail), created: false, linked: true };
  }
  const name = (extra.name || claims.name || claims.given_name || email.split('@')[0]).trim().slice(0, 80);
  const tz = extra.timezone && isValidTimezone(extra.timezone) ? extra.timezone : 'Asia/Kolkata';
  const country = extra.country && /^[A-Z]{2}$/.test(extra.country) ? extra.country : 'IN';
  const u = await db.transaction(async (tx) => {
    const [row] = await tx.insert(users).values({ email, name, passwordHash: null, timezone: tz, country, lastSeenAt: new Date() }).returning();
    await tx.insert(userIdentities).values({ userId: row.id, provider: providerId, subject: claims.sub, email });
    return row;
  });
  return { user: toPublic(u), created: true, linked: false };
}

/** Keeps at least one way to sign in. */
async function ensureAnotherWay(db: DB, userId: string, removing: 'phone' | ProviderId) {
  const u = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  const ids = await db.select().from(userIdentities).where(eq(userIdentities.userId, userId));
  const ways = (u.passwordHash ? 1 : 0) + (u.phoneVerifiedAt && removing !== 'phone' ? 1 : 0) + ids.filter((i) => i.provider !== removing).length;
  if (ways < 1) throw badRequest('Set a password first (Forgot password on the login page), so you can still sign in');
}

export async function unlinkIdentity(db: DB, user: PublicUser, providerId: ProviderId) {
  await ensureAnotherWay(db, user.id, providerId);
  await db.delete(userIdentities).where(and(eq(userIdentities.userId, user.id), eq(userIdentities.provider, providerId)));
}

export async function signInOptions(db: DB, userId: string) {
  const u = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  const ids = await db.select().from(userIdentities).where(eq(userIdentities.userId, userId));
  const otherSessions = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
  return {
    hasPassword: !!u.passwordHash, phone: u.phoneVerifiedAt ? u.phone : null, mfa: !!u.totpEnabledAt,
    recoveryCodesLeft: (JSON.parse(u.recoveryCodes ?? '[]') as string[]).length,
    identities: ids.map((i) => ({ provider: i.provider as ProviderId, email: i.email })), sessions: otherSessions.length
  };
}

/** Ends every other session (e.g. after losing a phone). */
export async function signOutOthers(db: DB, userId: string, keepTokenHash: string | null) {
  await db.delete(sessions).where(keepTokenHash ? and(eq(sessions.userId, userId), ne(sessions.id, keepTokenHash)) : eq(sessions.userId, userId));
}

export const totpCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
