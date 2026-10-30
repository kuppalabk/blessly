import { NextResponse } from 'next/server';
import type { DB } from './db';
import { setSessionCookie } from './http';
import { createSession } from './services/auth';
import { needsSecondStep, startMfaChallenge } from './services/signin';

export const MFA_COOKIE = 'ww_mfa';
export const OAUTH_COOKIE = 'ww_oauth';

/** Either starts a session, or (two-step verification on) asks for the code first. */
export async function finishSignIn(db: DB, userId: string, res: NextResponse) {
  if (await needsSecondStep(db, userId)) {
    const token = await startMfaChallenge(db, userId);
    res.cookies.set(MFA_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
    return 'mfa' as const;
  }
  const { token } = await createSession(db, userId);
  setSessionCookie(res, token);
  return 'session' as const;
}

export const safeNext = (n: string | null | undefined) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/home');
