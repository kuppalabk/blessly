'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export function CreateFamily({ suggestion }: { suggestion: string }) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { family } = await api<{ family: { id: string } }>('/api/families', { body: { name } });
      router.push(`/family/${family.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not create the circle"));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={create} className="stack" aria-label={t("Create a family circle")} noValidate>
      <label className="field">{t("Circle name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Creating…") : t("Create family circle")}</button>
    </form>
  );
}
