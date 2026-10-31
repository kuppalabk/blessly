'use client';
import { useRouter } from 'next/navigation';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { useState } from 'react';
import { api } from '@/components/api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { OCCASIONS } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';

export function CreateAlbum({ families }: { families: { id: string; name: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ title: '', occasion: 'birthday', familyId: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="card-box stack" aria-label={t("New album")} noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const r = await api<{ album: { id: string } }>('/api/albums', { body: v }); router.push(`/albums/${r.album.id}`); router.refresh(); }
      catch (err) { setError(err); setBusy(false); }
    }}>
      <h2 style={{ fontSize: 19 }}>{t("New album")}</h2>
      <label className="field">{t("Album name")}<input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={t("e.g. Dadi’s 80th birthday")} maxLength={80} /></label>
      <div className="two-col" style={{ gap: 12 }}>
        <label className="field">{t("Occasion")}<select className="select" aria-label={t("Occasion")} value={v.occasion} onChange={(e) => setV({ ...v, occasion: e.target.value })}><OccasionOptions /></select></label>
        {families.length > 0 && (
          <label className="field">{t("Share with family")}<select className="select" aria-label={t("Share with family")} value={v.familyId} onChange={(e) => setV({ ...v, familyId: e.target.value })}><option value="">{t("Only me")}</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        )}
      </div>
      <ErrorMessage error={error} />
      <button className="btn" disabled={busy}>{busy ? t("Creating…") : t("Create album")}</button>
    </form>
  );
}
