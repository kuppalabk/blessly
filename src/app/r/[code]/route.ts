import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { normaliseCode } from '@/server/services/promotions';

type Ctx = { params: Promise<{ code: string }> };

/** An affiliate link: remembers the code for 30 days, then sends the visitor to sign-up. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const code = normaliseCode((await params).code).slice(0, 40);
  const res = NextResponse.redirect(new URL('/signup', req.url));
  if (/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    res.cookies.set('ww_ref', code, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400 });
  }
  return res;
});
