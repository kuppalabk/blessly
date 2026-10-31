'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { useT } from '@/components/I18n';

export function NewWishlist() {
  const { t } = useT();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  const [eventDate, setEventDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="card-box stack" aria-label={t("New wishlist")} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const { wishlist } = await api<{ wishlist: { id: string } }>('/api/wishlists', { body: { title, occasion, eventDate } }); router.push(`/wishlists/${wishlist.id}`); }
      catch (err) { setError(err instanceof Error ? err.message : t("Could not create")); setBusy(false); }
    }}>
      <h2 style={{ margin: 0 }}>{t("Start a wishlist")}</h2>
      <div className="two-col" style={{ gap: 10 }}>
        <label className="field">{t("Name")}<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Our wedding registry")} maxLength={100} required /></label>
        <label className="field">{t("Occasion")}<select className="select" value={occasion} onChange={(e) => setOccasion(e.target.value)}><OccasionOptions /></select></label>
        <label className="field">{t("Date (optional)")}<input className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || title.trim().length < 2}>{busy ? t("Creating…") : t("Create wishlist")}</button>
    </form>
  );
}
