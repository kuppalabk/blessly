'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function UnsubscribeForm({ token, business, hasPhone, hasEmail }: { token: string; business: string; hasPhone: boolean; hasEmail: boolean }) {
  const { t } = useT();
  const [wa, setWa] = useState(true);
  const [email, setEmail] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <p className="notice" role="status">{t("Done. {business} won’t send you these messages any more.", { business })}</p>;
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); setError(null);
      try { await api(`/api/u/${token}`, { body: { whatsapp: hasPhone && wa, email: hasEmail && email } }); setDone(true); }
      catch (err) { setError(err instanceof Error ? err.message : t("Something went wrong")); }
    }}>
      {hasPhone && <label className="check"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /><span>{t("Stop WhatsApp messages")}</span></label>}
      {hasEmail && <label className="check"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><span>{t("Stop emails")}</span></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-block">{t("Unsubscribe")}</button>
    </form>
  );
}
