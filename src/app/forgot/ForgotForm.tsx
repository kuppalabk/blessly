'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function ForgotForm() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (sent) return <p className="notice" role="status">{t("If there’s an account for {email}, a reset link is on its way. It works for 60 minutes — check your spam folder too.", { email })}</p>;
  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api('/api/auth/forgot', { body: { email } }); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : t("Something went wrong")); }
      setBusy(false);
    }}>
      <label className="field">{t("Email")}<input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-block" disabled={busy}>{busy ? t("Sending…") : t("Send reset link")}</button>
    </form>
  );
}
