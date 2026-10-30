import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { encrypt } from '@/server/crypto';
import { currentUser } from '@/server/http';
import { authorizeUrl, pkce, provider } from '@/server/oidc';
import { OAUTH_COOKIE, safeNext } from '@/server/signin-flow';
const appUrl = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;

/** Starts "Continue with Google/Apple". State, nonce and PKCE verifier travel in an encrypted, short-lived cookie. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = provider((await params).provider);
  const url = new URL(req.url);
  if (!p) return NextResponse.redirect(new URL('/login?error=provider', appUrl(req)));
  const link = url.searchParams.get('link') === '1' ? (await currentUser())?.id ?? null : null;
  const { verifier, challenge } = pkce();
  const state = randomBytes(16).toString('base64url'), nonce = randomBytes(16).toString('base64url');
  const tz = url.searchParams.get('tz') ?? '', country = url.searchParams.get('country') ?? '';
  const box = encrypt(JSON.stringify({ p: p.id, state, nonce, verifier, next: safeNext(url.searchParams.get('next')), tz: tz.slice(0, 60), country: country.slice(0, 2), link, at: Date.now() }));
  const res = NextResponse.redirect(authorizeUrl(p, `${appUrl(req)}/api/auth/oauth/${p.id}/callback`, state, nonce, challenge));
  const https = appUrl(req).startsWith('https://');
  // Apple returns with a cross-site POST, so its cookie must be SameSite=None (which needs HTTPS).
  res.cookies.set(OAUTH_COOKIE, box, { httpOnly: true, secure: https, sameSite: p.formPost && https ? 'none' : 'lax', path: '/api/auth/oauth', maxAge: 600 });
  return res;
}
