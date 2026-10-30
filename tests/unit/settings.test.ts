import { describe, expect, it, afterEach } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { SETTINGS, settingDef, cfg, cfgOn } from '@/server/settings';
import { decrypt, encrypt } from '@/server/crypto';
import { testGroup } from '@/server/integration-tests';

const touched: string[] = [];
function setEnv(key: string, value: string | undefined) {
  touched.push(key);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
afterEach(() => { for (const k of touched.splice(0)) delete process.env[k]; });

describe('settings registry', () => {
  it('has a unique key for every setting', () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('marks every credential as secret and the Apple key as an uploaded file', () => {
    expect(settingDef('STRIPE_SECRET_KEY')?.secret).toBe(true);
    expect(settingDef('RAZORPAY_KEY_SECRET')?.secret).toBe(true);
    expect(settingDef('APPLE_PRIVATE_KEY')).toMatchObject({ secret: true, file: true });
    expect(settingDef('EMAIL_FROM')?.secret).toBe(false);
  });

  it('never lists a database-only switch as a secret', () => {
    for (const k of ['MONEY_FEATURES', 'BILLING_TEST_MODE', 'LEGAL_APPROVED']) expect(settingDef(k)?.secret).toBe(false);
  });
});

describe('settings precedence', () => {
  it('reads the environment when nothing is saved in the admin', () => {
    setEnv('EMAIL_FROM', 'Env <env@example.com>');
    expect(cfg('EMAIL_FROM')).toBe('Env <env@example.com>');
  });

  it('treats a blank environment value as not set', () => {
    setEnv('EMAIL_FROM', '   ');
    expect(cfg('EMAIL_FROM')).toBeUndefined();
  });

  it('reads feature switches as on only for 1 or true', () => {
    setEnv('MONEY_FEATURES', '1');
    expect(cfgOn('MONEY_FEATURES')).toBe(true);
    setEnv('MONEY_FEATURES', 'yes');
    expect(cfgOn('MONEY_FEATURES')).toBe(false);
  });
});

describe('secret encryption', () => {
  it('round-trips a value and never returns the plain text inside the stored box', () => {
    const box = encrypt('sk_live_example_1234');
    expect(box).not.toContain('sk_live_example_1234');
    expect(decrypt(box)).toBe('sk_live_example_1234');
  });

  it('gives a different box each time (random nonce)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('refuses a box that was altered', () => {
    const box = encrypt('value');
    const [v, iv, tag, data] = box.split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
    expect(() => decrypt('not-a-box')).toThrow(/Unreadable/);
  });

  it('uses 12-byte nonces and 16-byte tags', () => {
    const [, iv, tag] = encrypt('x').split('.');
    expect(Buffer.from(iv, 'base64url')).toHaveLength(12);
    expect(Buffer.from(tag, 'base64url')).toHaveLength(16);
    expect(randomBytes(12)).toHaveLength(12);
  });
});

describe('connection checks without network', () => {
  it('lists what is missing instead of calling a provider', async () => {
    for (const k of ['STRIPE_SECRET_KEY']) setEnv(k, undefined);
    const r = await testGroup('stripe');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Missing: STRIPE_SECRET_KEY/);
  });

  it('accepts a well-formed VAPID pair and rejects a malformed one', async () => {
    setEnv('VAPID_PUBLIC_KEY', Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString('base64url'));
    setEnv('VAPID_PRIVATE_KEY', randomBytes(32).toString('base64url'));
    expect((await testGroup('push')).ok).toBe(true);
    setEnv('VAPID_PUBLIC_KEY', 'abc');
    expect((await testGroup('push')).ok).toBe(false);
  });

  it('parses an Apple .p8 key', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    setEnv('APPLE_CLIENT_ID', 'app.blessly.signin');
    setEnv('APPLE_TEAM_ID', 'TEAM123456');
    setEnv('APPLE_KEY_ID', 'KEY1234567');
    setEnv('APPLE_PRIVATE_KEY', pem);
    expect((await testGroup('apple')).ok).toBe(true);
    setEnv('APPLE_PRIVATE_KEY', 'not a key');
    expect((await testGroup('apple')).ok).toBe(false);
  });

  it('rejects a Google client ID with the wrong shape', async () => {
    setEnv('GOOGLE_CLIENT_ID', 'abc');
    setEnv('GOOGLE_CLIENT_SECRET', 'secret');
    const r = await testGroup('google');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/apps\.googleusercontent\.com/);
  });
});
