import { cfg } from './settings';
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import { AppError } from './errors';

/**
 * "Sign in with Google" and "Sign in with Apple" (OpenID Connect, authorization code + PKCE).
 * ID tokens are verified against the provider's published keys: signature, issuer, audience, expiry and nonce.
 * Endpoints can be overridden with env vars (used by the end-to-end tests' mock provider).
 */

export type ProviderId = 'google' | 'apple';
export type Provider = {
  id: ProviderId; label: string; clientId: string; authUrl: string; tokenUrl: string; jwksUrl: string; issuers: string[];
  scope: string; formPost: boolean; clientSecret: () => string;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Apple's client secret is a short-lived JWT signed with the developer's private key (ES256). */
export function appleClientSecret(teamId: string, keyId: string, privateKeyPem: string, clientId: string, now = Date.now()) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({ iss: teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }));
  const sig = cryptoSign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(privateKeyPem.replace(/\\n/g, '\n')), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}

export function provider(id: string, env: Record<string, string | undefined> = process.env): Provider | null {
  // An explicitly passed env object (tests) wins; otherwise admin-saved keys, then environment variables.
  const val = (k: string) => (env === process.env ? cfg(k) : env[k]?.trim() || undefined);
  if (id === 'google' && val('GOOGLE_CLIENT_ID') && val('GOOGLE_CLIENT_SECRET')) {
    return {
      id: 'google', label: 'Google', clientId: (val('GOOGLE_CLIENT_ID') ?? ''),
      authUrl: env.OIDC_GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: env.OIDC_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      jwksUrl: env.OIDC_GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
      issuers: env.OIDC_GOOGLE_ISSUER ? [env.OIDC_GOOGLE_ISSUER] : ['https://accounts.google.com', 'accounts.google.com'],
      scope: 'openid email profile', formPost: false, clientSecret: () => val('GOOGLE_CLIENT_SECRET')!
    };
  }
  if (id === 'apple' && val('APPLE_CLIENT_ID') && val('APPLE_TEAM_ID') && val('APPLE_KEY_ID') && val('APPLE_PRIVATE_KEY')) {
    return {
      id: 'apple', label: 'Apple', clientId: (val('APPLE_CLIENT_ID') ?? ''),
      authUrl: env.OIDC_APPLE_AUTH_URL || 'https://appleid.apple.com/auth/authorize',
      tokenUrl: env.OIDC_APPLE_TOKEN_URL || 'https://appleid.apple.com/auth/token',
      jwksUrl: env.OIDC_APPLE_JWKS_URL || 'https://appleid.apple.com/auth/keys',
      issuers: [env.OIDC_APPLE_ISSUER || 'https://appleid.apple.com'],
      scope: 'name email', formPost: true,
      clientSecret: () => appleClientSecret(val('APPLE_TEAM_ID')!, val('APPLE_KEY_ID')!, val('APPLE_PRIVATE_KEY')!, val('APPLE_CLIENT_ID')!)
    };
  }
  return null;
}

export const enabledProviders = (env: Record<string, string | undefined> = process.env) => (['google', 'apple'] as const).filter((p) => provider(p, env));

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(p: Provider, redirectUri: string, state: string, nonce: string, challenge: string) {
  const u = new URL(p.authUrl);
  u.search = new URLSearchParams({
    client_id: p.clientId, redirect_uri: redirectUri, response_type: 'code', scope: p.scope, state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
    ...(p.formPost ? { response_mode: 'form_post' } : { prompt: 'select_account' })
  }).toString();
  return u.toString();
}

const jwksCache = new Map<string, { at: number; keys: (JsonWebKey & { kid?: string })[] }>();
async function keys(p: Provider, fetchImpl: typeof fetch, force = false) {
  const hit = jwksCache.get(p.jwksUrl);
  if (hit && !force && Date.now() - hit.at < 3600_000) return hit.keys;
  const res = await fetchImpl(p.jwksUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new AppError(502, 'oidc', `Couldn’t reach ${p.label}`);
  const json = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  jwksCache.set(p.jwksUrl, { at: Date.now(), keys: json.keys });
  return json.keys;
}

export type Claims = { sub: string; email?: string; email_verified?: boolean | string; name?: string; given_name?: string; nonce?: string; iss: string; aud: string | string[]; exp: number; iat?: number };

export async function verifyIdToken(p: Provider, token: string, nonce: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Claims> {
  const bad = (why: string) => new AppError(401, 'oidc', `${p.label} sign-in failed (${why}). Please try again.`);
  const parts = token.split('.');
  if (parts.length !== 3) throw bad('malformed token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg: string; kid?: string };
  if (header.alg !== 'RS256') throw bad('unexpected algorithm');
  let jwk = (await keys(p, fetchImpl)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await keys(p, fetchImpl, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw bad('unknown key');
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw bad('bad signature');
  const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Claims;
  if (!p.issuers.includes(c.iss)) throw bad('wrong issuer');
  if (!(Array.isArray(c.aud) ? c.aud.includes(p.clientId) : c.aud === p.clientId)) throw bad('wrong audience');
  if (!c.exp || c.exp * 1000 < now - 60_000) throw bad('expired');
  if (!c.nonce || c.nonce !== nonce) throw bad('nonce mismatch');
  if (!c.sub) throw bad('no subject');
  return c;
}

export async function exchangeCode(p: Provider, code: string, redirectUri: string, verifier: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(p.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: p.clientId, client_secret: p.clientSecret(), code_verifier: verifier }),
    signal: AbortSignal.timeout(15000)
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !json.id_token) throw new AppError(401, 'oidc', `${p.label} sign-in failed. Please try again.`);
  return json.id_token;
}
