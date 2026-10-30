'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function YourData() {
  const { t } = useT();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card-box stack" aria-labelledby="data-h">
      <h2 id="data-h" style={{ fontSize: 18 }}>{t("Your data")}</h2>
      <p className="muted small">{t("Download a copy of everything Blessly stores about you, or delete your account. Read our")}{' '}<a href="/privacy">{t("privacy policy")}</a> {' '}{t("and")}{' '}<a href="/terms">{t("terms")}</a>.</p>
      <a className="btn btn-ghost" href="/api/me/export" download>{t("Download my data")}</a>
      {!deleting ? <button className="btn btn-danger" onClick={() => setDeleting(true)}>{t("Delete my account…")}</button> : (
        <form className="stack" aria-label={t("Delete my account")} onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { await api('/api/me', { method: 'DELETE', body: { password, confirm } }); router.replace('/'); router.refresh(); }
          catch (err) { setError(err instanceof Error ? err.message : t("Could not delete")); setBusy(false); }
        }}>
          <p className="small"><b>{t("This permanently deletes your account")}</b>{t(", your people, reminders, wishes and wish pages, and your business with its customers. Family circles you own pass to the next person in the circle. This can’t be undone.")}</p>
          <label className="field">{t("Your password")}<input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="field">{t("Type DELETE to confirm")}<input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row"><button className="btn btn-danger grow" disabled={busy || confirm !== 'DELETE'}>{t("Delete forever")}</button><button type="button" className="btn btn-ghost grow" onClick={() => setDeleting(false)}>{t("Cancel")}</button></div>
        </form>
      )}
    </section>
  );
}
