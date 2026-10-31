import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { AppError, toErrorBody } from './errors';
import { SESSION_DAYS, userFromSession, type PublicUser } from './services/auth';
import { loadSettings } from './settings';

export const SESSION_COOKIE = 'ww_session';
/** Holds the admin's own session while they use the read-only support view. */
export const ADMIN_COOKIE = 'ww_admin_session';

export async function currentUser(): Promise<PublicUser | null> {
  await loadSettings();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromSession(getDb(), token);
}

export async function requireUser(): Promise<PublicUser> {
  const u = await currentUser();
  if (!u) throw new AppError(401, 'unauthenticated', 'Please log in');
  return u;
}

/** For pages: sends logged-out (or suspended) visitors to the login page instead of erroring. */
export async function pageUser(): Promise<PublicUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}

export function setSessionCookie(res: NextResponse, token: string) {
  // A fresh login always ends any support view in this browser.
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function setAdminCookie(res: NextResponse, token: string, maxAgeSeconds: number) {
  res.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: maxAgeSeconds });
}

/** Wraps a route handler: JSON errors, consistent status codes. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await loadSettings();
      return await fn(...args);
    } catch (e) {
      const { status, body } = toErrorBody(e);
      // Error messages are shown to people: translate them into their language when we have a translation.
      try {
        const { translateMessage, getLocale } = await import('./i18n');
        const locale = await getLocale();
        if (locale !== 'en') {
          body.error = translateMessage(locale, body.error);
          if (body.fields) for (const k of Object.keys(body.fields)) body.fields[k] = translateMessage(locale, body.fields[k]);
        }
      } catch { /* never let translation break an error response */ }
      return NextResponse.json(body, { status });
    }
  };
}

/**
 * Reads the request body but stops (413) as soon as it passes `maxBytes`, even when the client sends no
 * Content-Length or lies about it — so a huge upload can't exhaust the server's memory.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Buffer> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) throw new AppError(413, 'too_large', 'That’s too large');
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => undefined); throw new AppError(413, 'too_large', 'That’s too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** multipart/form-data with a hard size cap. */
export async function readFormLimited(req: Request, maxBytes: number): Promise<FormData> {
  const buf = await readBodyLimited(req, maxBytes);
  try {
    return await new Response(new Uint8Array(buf), { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
  } catch {
    throw new AppError(400, 'bad_form', 'Send the photo as a file upload');
  }
}

export async function readJson(req: Request, maxBytes = 100_000): Promise<unknown> {
  const text = (await readBodyLimited(req, maxBytes)).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'bad_json', 'Invalid JSON');
  }
}

/**
 * Fixed-window rate limiter.
 * - memory (default in development and tests): per server process.
 * - postgres (default in production, or RATE_LIMIT_STORE=postgres): shared by every server, no Redis needed.
 */
const buckets = new Map<string, { n: number; reset: number }>();
const useDb = () => (process.env.RATE_LIMIT_STORE ?? (process.env.NODE_ENV === 'production' ? 'postgres' : 'memory')) === 'postgres';
const tooMany = () => new AppError(429, 'rate_limited', 'Too many attempts. Please wait a minute and try again.');

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  // RATE_LIMIT_SCALE lets automated test runs raise limits; never set it in production.
  limit = limit * Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1);
  const k = key.slice(0, 200);
  if (useDb()) {
    const n = await dbHit(k, windowMs);
    if (n > limit) throw tooMany();
    return;
  }
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { n: 1, reset: now + windowMs });
    if (buckets.size > 10000) for (const [x, v] of buckets) if (v.reset < now) buckets.delete(x);
    return;
  }
  b.n++;
  if (b.n > limit) throw tooMany();
}

/** One atomic upsert per hit: starts a new window when the old one has ended. Returns the count in this window. */
export async function dbHit(key: string, windowMs: number, db = getDb(), now = new Date()) {
  const reset = new Date(now.getTime() + windowMs);
  const { rows } = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, reset_at) values (${key}, 1, ${reset})
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= ${now} then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= ${now} then ${reset} else rate_limits.reset_at end
    returning count`);
  return Number(rows[0].count);
}

export function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
