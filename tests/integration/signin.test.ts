import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, makeUser, resetDb } from './helpers';
import { closeDb } from '@/server/db';
import { users, outbox, userIdentities } from '@/server/schema';
import { totp } from '@/server/totp';
import type { SmsProvider } from '@/server/providers/sms';
import { logIn } from '@/server/services/auth';
import { assertAdmin } from '@/server/services/admin';
import { deleteOwnAccount } from '@/server/services/account';
import {
  checkSecondFactor, completeMfaChallenge, confirmMfaSetup, confirmPhone, disableMfa, oauthSignIn, regenerateRecoveryCodes, removePhone,
  signInOptions, startMfaChallenge, startMfaSetup, startPhoneLogin, startPhoneVerify, unlinkIdentity, verifyPhoneLogin
} from '@/server/services/signin';

beforeEach(resetDb);
afterAll(closeDb);

class Sms implements SmsProvider {
  name = 'outbox'; sent: { to: string; text: string }[] = [];
  async send(to: string, text: string) { this.sent.push({ to, text }); return { id: null }; }
}
const codeIn = (s: Sms) => s.sent.at(-1)!.text.match(/\d{6}/)![0];

describe('two-step verification', () => {
  it('set up, sign in with a code, refuse reused codes, recovery codes work once', async () => {
    const u = await makeUser();
    const { secret, qr } = await startMfaSetup(db(), u);
    expect(qr).toMatch(/^data:image\/svg\+xml;base64,/);
    const row = (await db().query.users.findFirst({ where: eq(users.id, u.id) }))!;
    expect(row.totpSecret).not.toContain(secret); // encrypted at rest
    await expect(confirmMfaSetup(db(), u, '000000')).rejects.toThrow(/isn’t right/);
    const t0 = new Date();
    const { recoveryCodes } = await confirmMfaSetup(db(), u, totp(secret, t0.getTime()), t0);
    expect(recoveryCodes).toHaveLength(10);
    expect((await signInOptions(db(), u.id)).mfa).toBe(true);

    // Password accepted → a challenge, not a session.
    const token = await startMfaChallenge(db(), u.id);
    await expect(completeMfaChallenge(db(), token, totp(secret, t0.getTime()), t0)).rejects.toThrow(/isn’t right/); // same code as set-up: replay
    const t1 = new Date(t0.getTime() + 60_000);
    expect((await completeMfaChallenge(db(), token, totp(secret, t1.getTime()), t1)).id).toBe(u.id);
    await expect(completeMfaChallenge(db(), token, totp(secret, t1.getTime()), t1)).rejects.toThrow(/expired/); // used up

    expect(await checkSecondFactor(db(), u.id, recoveryCodes[0])).toBe(true);
    expect(await checkSecondFactor(db(), u.id, recoveryCodes[0])).toBe(false);
    expect((await signInOptions(db(), u.id)).recoveryCodesLeft).toBe(9);
    const fresh = await regenerateRecoveryCodes(db(), u, recoveryCodes[1]);
    expect((await signInOptions(db(), u.id)).recoveryCodesLeft).toBe(10);
    await disableMfa(db(), u, fresh.recoveryCodes[0]);
    expect((await signInOptions(db(), u.id)).mfa).toBe(false);
  });

  it('locks a challenge after five wrong codes', async () => {
    const u = await makeUser();
    const { secret } = await startMfaSetup(db(), u);
    await confirmMfaSetup(db(), u, totp(secret));
    const token = await startMfaChallenge(db(), u.id);
    for (let i = 0; i < 5; i++) await expect(completeMfaChallenge(db(), token, '123456')).rejects.toThrow();
    await expect(completeMfaChallenge(db(), token, totp(secret, Date.now() + 30000))).rejects.toMatchObject({ status: 429 });
  });

  it('admins need it on, and can’t turn it off', async () => {
    const a = await makeUser();
    await db().update(users).set({ role: 'admin' }).where(eq(users.id, a.id));
    expect(() => assertAdmin({ ...a, role: 'admin', mfa: false })).toThrow(/two-step/);
    expect(() => assertAdmin({ ...a, role: 'admin', mfa: true })).not.toThrow();
    const { secret } = await startMfaSetup(db(), a);
    await confirmMfaSetup(db(), a, totp(secret));
    await expect(disableMfa(db(), { ...a, role: 'admin' }, totp(secret, Date.now() + 30000))).rejects.toThrow(/Admins/);
  });
});

describe('text-message codes', () => {
  it('verify a number, then sign in with a code; unknown numbers get the same answer but no text', async () => {
    const u = await makeUser({ country: 'IN' });
    const sms = new Sms();
    const v = await startPhoneVerify(db(), u, { phone: '98765 43210' }, sms);
    expect(v.phone).toBe('+919876543210');
    expect(v.devCode).toBe(codeIn(sms)); // shown on screen outside production
    await expect(confirmPhone(db(), u, v.token, '000000')).rejects.toThrow(/isn’t right/);
    await confirmPhone(db(), u, v.token, codeIn(sms));
    const box = await db().select().from(outbox).where(eq(outbox.channel, 'sms'));
    expect(box[0].body).not.toMatch(/\d{6}/); // codes never stored in clear

    const other = await makeUser();
    await expect(startPhoneVerify(db(), other, { phone: '+91 98765 43210' }, sms)).rejects.toThrow(/another account/);

    const before = sms.sent.length;
    const nobody = await startPhoneLogin(db(), { phone: '+44 7700 900999' }, sms);
    expect(sms.sent.length).toBe(before);
    expect(nobody.devCode).toBeUndefined();
    await expect(verifyPhoneLogin(db(), nobody.token, '123456')).rejects.toThrow();

    const s = await startPhoneLogin(db(), { phone: '+919876543210' }, sms);
    expect((await verifyPhoneLogin(db(), s.token, codeIn(sms))).id).toBe(u.id);
    await expect(verifyPhoneLogin(db(), s.token, codeIn(sms))).rejects.toThrow(/expired/);
    await expect(verifyPhoneLogin(db(), s.token, codeIn(sms), new Date(Date.now() + 11 * 60000))).rejects.toThrow(/expired/);
  });
});

describe('Google and Apple', () => {
  const claims = (o: Record<string, unknown> = {}) => ({ sub: 'g-123', email: 'new@example.com', email_verified: true, name: 'Nina New', iss: 'x', aud: 'y', exp: 0, ...o });

  it('creates an account without a password, signs it in again, and links an existing email', async () => {
    const r = await oauthSignIn(db(), 'google', claims(), { timezone: 'Europe/London', country: 'GB' });
    expect(r).toMatchObject({ created: true, user: { email: 'new@example.com', name: 'Nina New', timezone: 'Europe/London', country: 'GB' } });
    expect((await oauthSignIn(db(), 'google', claims({ email: 'changed@example.com' }))).user.id).toBe(r.user.id);
    await expect(logIn(db(), 'new@example.com', '')).rejects.toThrow(/incorrect/); // no password to guess

    const existing = await makeUser({ email: 'old@example.com' });
    const apple = await oauthSignIn(db(), 'apple', claims({ sub: 'a-1', email: 'OLD@example.com', email_verified: 'true' }), { name: 'Ignored' });
    expect(apple).toMatchObject({ created: false, linked: true, user: { id: existing.id } });
    await expect(oauthSignIn(db(), 'google', claims({ sub: 'g-2', email: 'x@example.com', email_verified: false }))).rejects.toThrow(/email/);
    await expect(oauthSignIn(db(), 'google', claims(), { linkTo: existing.id })).rejects.toThrow(/already linked/);

    // Never leave an account without a way in.
    const passwordless = r.user;
    await expect(unlinkIdentity(db(), passwordless, 'google')).rejects.toThrow(/password first/);
    await unlinkIdentity(db(), existing, 'apple');
    expect(await db().select().from(userIdentities).where(eq(userIdentities.userId, existing.id))).toEqual([]);
    await removePhone(db(), passwordless); // fine: Google is still a way in
    // Passwordless accounts confirm deletion by typing DELETE.
    await deleteOwnAccount(db(), passwordless.id, { confirm: 'DELETE' });
    expect(await db().query.users.findFirst({ where: eq(users.id, passwordless.id) })).toBeUndefined();
  });
});
