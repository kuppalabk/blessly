import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { base32Decode, base32Encode, hotp, otpauthUri, totp, verifyTotp } from '@/server/totp';
import { appleClientSecret, authorizeUrl, pkce, provider, verifyIdToken, type Provider } from '@/server/oidc';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('authenticator codes (RFC 4226 / 6238)', () => {
  it('matches the published test vectors', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect([0, 1, 2, 3, 9].map((c) => hotp(RFC_SECRET, c))).toEqual(['755224', '287082', '359152', '969429', '520489']);
    expect(totp(RFC_SECRET, 59_000)).toBe('287082');
    expect(totp(RFC_SECRET, 1111111109_000)).toBe('081804');
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(Buffer.from('1234567'));
  });
  it('accepts one step of clock drift, rejects old and reused codes', () => {
    const t = 1_800_000_000_000;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t)).toBe(Math.floor(t / 30000));
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 30000), t)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 90000), t)).toBeNull();
    const step = verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t)!;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t, step)).toBeNull(); // replay
    expect(verifyTotp(RFC_SECRET, 'abcdef', t)).toBeNull();
    expect(otpauthUri('ABC', 'a@b.com')).toBe('otpauth://totp/Blessly:a%40b.com?secret=ABC&issuer=Blessly&algorithm=SHA1&digits=6&period=30');
  });
});

describe('Google / Apple ID tokens', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const p: Provider = { id: 'google', label: 'Google', clientId: 'client-1', authUrl: 'https://idp.test/auth', tokenUrl: 'https://idp.test/token', jwksUrl: 'https://idp.test/jwks-' + Math.random(), issuers: ['https://idp.test'], scope: 'openid email', formPost: false, clientSecret: () => 's' };
  const fetchJwks = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const make = (claims: Record<string, unknown>, kid = 'k1', key = privateKey) => {
    const head = b64({ alg: 'RS256', kid }), body = b64({ iss: 'https://idp.test', aud: 'client-1', sub: 'u-1', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', email: 'a@b.com', email_verified: true, ...claims });
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
  };
  it('verifies signature, issuer, audience, expiry and nonce', async () => {
    expect((await verifyIdToken(p, make({}), 'n1', fetchJwks)).sub).toBe('u-1');
    await expect(verifyIdToken(p, make({ nonce: 'other' }), 'n1', fetchJwks)).rejects.toThrow(/nonce/);
    await expect(verifyIdToken(p, make({ aud: 'someone-else' }), 'n1', fetchJwks)).rejects.toThrow(/audience/);
    await expect(verifyIdToken(p, make({ iss: 'https://evil.test' }), 'n1', fetchJwks)).rejects.toThrow(/issuer/);
    await expect(verifyIdToken(p, make({ exp: 1000 }), 'n1', fetchJwks)).rejects.toThrow(/expired/);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(verifyIdToken(p, make({}, 'k1', other), 'n1', fetchJwks)).rejects.toThrow(/signature/);
    const [h, b, s] = make({}).split('.');
    const forged = `${h}.${b64({ ...JSON.parse(Buffer.from(b, 'base64url').toString()), sub: 'admin' })}.${s}`;
    await expect(verifyIdToken(p, forged, 'n1', fetchJwks)).rejects.toThrow(/signature/);
    const none = `${b64({ alg: 'none', kid: 'k1' })}.${b}.`;
    await expect(verifyIdToken(p, none, 'n1', fetchJwks)).rejects.toThrow(/algorithm/);
  });
  it('builds the authorize URL with PKCE, and Apple’s ES256 client secret', () => {
    const { verifier, challenge } = pkce();
    expect(verifier.length).toBeGreaterThan(40);
    const u = new URL(authorizeUrl(p, 'https://app/cb', 'st', 'no', challenge));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: 'client-1', redirect_uri: 'https://app/cb', state: 'st', nonce: 'no', code_challenge: challenge, code_challenge_method: 'S256', response_type: 'code' });
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = ec.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const jwt = appleClientSecret('TEAM', 'KEY', pem, 'com.app.web', 1_800_000_000_000);
    const [h, b, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(b, 'base64url').toString())).toMatchObject({ iss: 'TEAM', sub: 'com.app.web', aud: 'https://appleid.apple.com', exp: 1_800_000_300 });
    expect(verify('sha256', Buffer.from(`${h}.${b}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
    expect(provider('google', {})).toBeNull();
    expect(provider('apple', { APPLE_CLIENT_ID: 'x', APPLE_TEAM_ID: 't', APPLE_KEY_ID: 'k', APPLE_PRIVATE_KEY: pem })!.formPost).toBe(true);
  });
});
