'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/components/I18n';

export function GuestUpload({ slug }: { slug: string }) {
  const { t, tp } = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="card-box stack" style={{ maxWidth: 520, margin: '0 auto' }} aria-label={t("Add your photos")} onSubmit={async (e) => {
      e.preventDefault();
      const files = (e.currentTarget.elements.namedItem('photos') as HTMLInputElement).files;
      if (!name.trim()) return setMsg({ ok: false, text: t('Add your name') });
      if (!files?.length) return setMsg({ ok: false, text: t('Choose at least one photo') });
      setBusy(true); setMsg(null);
      let added = 0;
      for (const f of Array.from(files).slice(0, 20)) {
        const form = new FormData(); form.append('name', name); form.append('photo', f);
        const res = await fetch(`/api/a/${slug}/photos`, { method: 'POST', body: form });
        if (res.ok) added++; else { const j = await res.json().catch(() => ({})); setMsg({ ok: false, text: j.error ?? t('Upload failed') }); break; }
      }
      if (added) { setMsg({ ok: true, text: tp(added, 'Thanks, {name}! {n} photo added.', 'Thanks, {name}! {n} photos added.', { name: name.split(' ')[0] }) }); router.refresh(); }
      setBusy(false);
    }}>
      <h2 style={{ fontSize: 18 }}>{t("Add your photos")}</h2>
      <label className="field">{t("Your name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
      <label className="field">{t("Photos")}<input className="input" style={{ paddingTop: 10 }} name="photos" type="file" accept="image/*" multiple /></label>
      {msg && <p className={msg.ok ? 'notice' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Uploading…") : t("Add photos")}</button>
    </form>
  );
}
