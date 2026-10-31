'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { useT } from '@/components/I18n';

export function ResetForm({ token }: { token: string }) {
  const { t } = useT();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  if (expired) return <div className="stack"><p className="notice">{error}</p><Link className="btn" href="/forgot">{t("Send a new link")}</Link></div>;
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      if (password !== again) return setError(t("The two passwords don’t match"));
      setBusy(true);
      try { await api('/api/auth/reset', { body: { token, password } }); router.replace('/home'); router.refresh(); }
      catch (err) {
        setError(err instanceof ApiError && err.fields?.password ? err.fields.password : err instanceof Error ? err.message : t("Something went wrong"));
        if (err instanceof ApiError && err.status === 400 && !err.fields) setExpired(true);
        setBusy(false);
      }
    }}>
      <label className="field">{t("New password")}<input className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="field">{t("Type it again")}<input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">{t("You’ll be logged out on your other devices.")}</p>
      <button className="btn btn-block" disabled={busy}>{busy ? t("Saving…") : t("Save new password")}</button>
    </form>
  );
}
