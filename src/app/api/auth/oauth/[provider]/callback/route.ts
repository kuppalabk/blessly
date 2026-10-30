import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/server/db';
import { decrypt } from '@/server/crypto';
import { AppError } from '@/server/errors';
import { clientIp, rateLimit } from '@/server/http';
import { exchangeCode, provider, verifyIdToken } from '@/server/oidc';
import { oauthSignIn } from '@/server/services/signin';
import { finishSignIn, OAUTH_COOKIE } from '@/server/signin-flow';

const appUrl = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;
type Box = { p: string; state: string; nonce: string; verifier: string; next: string; tz: string; country: string; link: string | null; at: number };

async function handle(req: Request, providerId: string, fields: URLSearchParams) {
  const base = appUrl(req);
  const fail = (code: string) => { const r = NextResponse.redirect(new URL(`/login?error=${code}`, base), 303); r.cookies.set(OAUTH_COOKIE, '', { path: '/api/auth/oauth', maxAge: 0 }); return r; };
  const p = provider(providerId);
  if (!p) return fail('provider');
  try { await rateLimit(`oauth:${clientIp(req)}`, 30, 15 * 60000); } catch { return fail('rate'); }
  if (fields.get('error')) return fail(fields.get('error') === 'access_denied' || fields.get('error') === 'user_cancelled_authorize' ? 'cancelled' : 'oauth');
  let box: Box;
  try { box = JSON.parse(decrypt((await cookies()).get(OAUTH_COOKIE)?.value ?? '')) as Box; } catch { return fail('expired'); }
  if (box.p !== p.id || box.state !== fields.get('state') || Date.now() - box.at > 600_000) return fail('expired');
  const code = fields.get('code');
  if (!code) return fail('oauth');
  try {
    const idToken = await exchangeCode(p, code, `${base}/api/auth/oauth/${p.id}/callback`, box.verifier);
    const claims = await verifyIdToken(p, idToken, box.nonce);
    // Apple sends the person's name only the first time, as a form field.
    let name: string | null = null;
    try { const u = JSON.parse(fields.get('user') ?? 'null') as { name?: { firstName?: string; lastName?: string } } | null; name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(' ') || null; } catch { /* not sent */ }
    const r = await oauthSignIn(getDb(), p.id, claims, { name, timezone: box.tz, country: box.country, linkTo: box.link });
    if (box.link) { const res = NextResponse.redirect(new URL('/settings/security?linked=' + p.id, base), 303); res.cookies.set(OAUTH_COOKIE, '', { path: '/api/auth/oauth', maxAge: 0 }); return res; }
    const res = NextResponse.redirect(new URL(box.next, base), 303);
    res.cookies.set(OAUTH_COOKIE, '', { path: '/api/auth/oauth', maxAge: 0 });
    if ((await finishSignIn(getDb(), r.user.id, res)) === 'mfa') res.headers.set('location', new URL(`/login/2fa?next=${encodeURIComponent(box.next)}`, base).toString());
    return res;
  } catch (e) {
    if (e instanceof AppError) { console.warn('[oauth]', p.id, e.message); return fail(e.code === 'suspended' ? 'suspended' : e.status === 400 ? 'email' : 'oauth'); }
    throw e;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, (await params).provider, new URL(req.url).searchParams);
}
/** Apple uses response_mode=form_post. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const text = await req.text();
  if (text.length > 20_000) return new Response('Too large', { status: 413 });
  return handle(req, (await params).provider, new URLSearchParams(text));
}
