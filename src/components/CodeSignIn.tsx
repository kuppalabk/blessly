'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from './api';
import { useT } from '@/components/I18n';

const dest = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/home');

/** Second step of signing in: the 6-digit code from an authenticator app, or a recovery code. */
export function TwoFactorForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 16px' }} className="stack-lg">
      <Link href="/" className="brand">{t("Blessly")}</Link>
      <h1>{t("Two-step verification")}</h1>
      <p className="muted">{recovery ? t("Enter one of your recovery codes. Each one works once.") : t("Open your authenticator app and enter the 6-digit code for Blessly.")}</p>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { await api('/api/auth/2fa', { body: { code } }); router.replace(dest(params.get('next'))); router.refresh(); }
        catch (err) { setError(err instanceof Error ? err.message : t("That code isn’t right")); setBusy(false); }
      }}>
        <label className="field">{recovery ? t("Recovery code") : t("Code")}
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} autoFocus maxLength={recovery ? 20 : 7} style={{ fontSize: 22, letterSpacing: '.2em' }} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-block" disabled={busy || code.trim().length < 6}>{busy ? t("Checking…") : t("Continue")}</button>
      </form>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRecovery(!recovery); setCode(''); setError(null); }}>{recovery ? t("Use my authenticator app") : t("Lost your phone? Use a recovery code")}</button>
      <p><Link href="/login">{t("Back to log in")}</Link></p>
    </div>
  );
}

/** Sign in with a code sent by text message to the number saved in Settings. */
export function PhoneSignIn() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<{ token: string; phone: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const country = typeof navigator !== 'undefined' ? (navigator.language.split('-')[1] ?? 'IN').toUpperCase() : 'IN';
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 16px' }} className="stack-lg">
      <Link href="/" className="brand">{t("Blessly")}</Link>
      <h1>{t("Sign in with a code")}</h1>
      {!sent ? (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { setSent(await api('/api/auth/phone/start', { body: { phone, country } })); } catch (err) { setError(err instanceof Error ? err.message : t("Could not send a code")); } finally { setBusy(false); }
        }}>
          <p className="muted" style={{ margin: 0 }}>{t("Works for accounts with a mobile number added in Settings → Sign-in and security.")}</p>
          <label className="field">{t("Mobile number")}<input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91 98765 43210" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-block" disabled={busy || phone.trim().length < 6}>{busy ? t("Sending…") : t("Text me a code")}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try {
            const r = await api<{ mfa?: boolean }>('/api/auth/phone/verify', { body: { token: sent.token, code } });
            const next = dest(params.get('next'));
            router.replace(r.mfa ? `/login/2fa?next=${encodeURIComponent(next)}` : next); router.refresh();
          } catch (err) { setError(err instanceof Error ? err.message : t("That code isn’t right")); setBusy(false); }
        }}>
          <p className="muted" style={{ margin: 0 }}>{t("If {phone} belongs to a Blessly account, we’ve sent it a 6-digit code.", { phone: sent.phone })}</p>
          {sent.devCode && <p className="notice" data-testid="dev-code">{t("Development mode — no text was sent. Your code is")}{' '}<b>{sent.devCode}</b></p>}
          <label className="field">{t("Code")}<input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={6} autoFocus style={{ fontSize: 22, letterSpacing: '.2em' }} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-block" disabled={busy || code.trim().length !== 6}>{busy ? t("Checking…") : t("Sign in")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSent(null); setCode(''); }}>{t("Use a different number")}</button>
        </form>
      )}
      <p><Link href="/login">{t("Back to log in")}</Link></p>
    </div>
  );
}
