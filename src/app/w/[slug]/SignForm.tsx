'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function SignForm({ slug, recipientName, defaultName = '' }: { slug: string; recipientName: string; defaultName?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(`/api/w/${slug}/signatures`, { body: { name, message } });
      setDone(true); setName(defaultName); setMessage('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not add your message"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <h3 style={{ fontSize: 17 }}>{t("Add your wish for {recipientName}", { recipientName })}</h3>
      <label className="field">{t("Your name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
      <label className="field">{t("Message")}<textarea className="textarea" style={{ minHeight: 90 }} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="notice" role="status">{t("Thanks — your message has been added.")}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Adding…") : t("Add my wish")}</button>
    </form>
  );
}
