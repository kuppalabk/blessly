'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from './api';
import { useT } from '@/components/I18n';
import { msg, regionName } from '@/lib/i18n/ui';
import { LanguagePicker } from './LanguagePicker';

const COUNTRIES = ['IN', 'GB', 'US', 'AE', 'OTHER'];

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: msg('Sign-in was cancelled.'), expired: msg('That took too long — please try again.'), email: msg('We need your email address to create an account. Please allow sharing it, or sign up with email.'),
  suspended: msg('This account is suspended. Please contact support.'), provider: msg('That sign-in option isn’t available.'), oauth: msg('Sign-in didn’t work. Please try again.'), rate: msg('Too many attempts. Please wait a minute.')
};

export function AuthForm({ mode, providers = [], phone = false }: { mode: 'login' | 'signup'; providers?: ('google' | 'apple')[]; phone?: boolean }) {
  const { t, locale } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    const f = new FormData(e.currentTarget);
    const body: Record<string, string> = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
    if (mode === 'signup') {
      body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      if (body.country === 'OTHER') body.country = 'XX';
    }
    try {
      const r = await api<{ mfa?: boolean }>(`/api/auth/${mode}`, { body });
      const next = params.get('next');
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
      if (r.mfa) { router.replace(`/login/2fa?next=${encodeURIComponent(dest)}`); return; }
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong"));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  const nextParam = params.get('next');
  const keep = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? `?next=${encodeURIComponent(nextParam)}` : '';
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 16px' }} className="stack-lg">
      <div className="row between"><Link href="/" className="brand">{t("Blessly")}</Link><LanguagePicker /></div>
      <h1>{mode === 'login' ? t("Welcome back") : t("Create your account")}</h1>
      {nextParam?.startsWith('/join/') && <p className="notice">{mode === 'login' ? t("You’ve been invited to a family circle. Log in to join.") : t("You’ve been invited to a family circle. Create a free account to join.")}</p>}
      {params.get('error') && OAUTH_ERRORS[params.get('error')!] && <p className="error" role="alert">{t(OAUTH_ERRORS[params.get('error')!])}</p>}
      {(providers.length > 0 || (phone && mode === 'login')) && (
        <div className="stack" style={{ gap: 8 }}>
          {providers.map((p) => (
            <a key={p} className="btn btn-ghost btn-block" href={`/api/auth/oauth/${p}`} onClick={(e) => {
              const q = new URLSearchParams({ next: params.get('next') ?? '/home', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '', country: (navigator.language.split('-')[1] ?? '').toUpperCase() });
              e.currentTarget.href = `/api/auth/oauth/${p}?${q}`;
            }}>{p === 'google' ? <GoogleMark /> : <AppleMark />}{t("Continue with")}{' '}{p === 'google' ? t("Google") : t("Apple")}</a>
          ))}
          {phone && mode === 'login' && <Link className="btn btn-ghost btn-block" href={`/login/phone${keep}`}>{t("📱 Sign in with a text message code")}</Link>}
          <p className="muted small" style={{ textAlign: 'center', margin: '4px 0 0' }}>{t("or with your email")}</p>
        </div>
      )}
      <form onSubmit={onSubmit} className="stack" noValidate>
        {mode === 'signup' && (
          <label className="field">{t("Your name")}<input className="input" name="name" autoComplete="name" required aria-invalid={!!fields.name} />
            {fields.name && <span className="error">{fields.name}</span>}
          </label>
        )}
        <label className="field">{t("Email")}<input className="input" name="email" type="email" autoComplete="email" required aria-invalid={!!fields.email} />
          {fields.email && <span className="error">{fields.email}</span>}
        </label>
        <label className="field">{t("Password")}<input className="input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} aria-invalid={!!fields.password} />
          {fields.password && <span className="error">{fields.password}</span>}
        </label>
        {mode === 'signup' && (
          <label className="field">{t("Country (for festival calendar)")}<select className="select" aria-label={t("Country")} name="country" defaultValue="IN">{COUNTRIES.map((c) => <option key={c} value={c}>{c === 'OTHER' ? t('Other') : regionName(c, locale)}</option>)}</select>
          </label>
        )}
        {error && !Object.keys(fields).length && <p className="error" role="alert">{error}</p>}
        {mode === 'signup' && <p className="muted small">{t("By creating an account you agree to the")}{' '}<Link href="/terms">{t("terms of use")}</Link> {' '}{t("and")}{' '}<Link href="/privacy">{t("privacy policy")}</Link>.</p>}
        <button className="btn btn-block" disabled={busy}>{busy ? t("Please wait…") : mode === 'login' ? t("Log in") : t("Create account")}</button>
      </form>
      {mode === 'login' && <p><Link href="/forgot">{t("Forgot your password?")}</Link></p>}
      <p className="muted">{mode === 'login' ? <>{t("New here?")}{' '}<Link href={`/signup${keep}`}>{t("Create an account")}</Link></> : <>{t("Already have an account?")}{' '}<Link href={`/login${keep}`}>{t("Log in")}</Link></>}</p>
    </div>
  );
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;
}
function AppleMark() {
  return <svg width="16" height="18" viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 2 5.8 1.1 7.4c-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.3zM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>;
}
