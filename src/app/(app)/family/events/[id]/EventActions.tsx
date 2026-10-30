'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { Icon } from '@/components/Icon';
import { useT } from '@/components/I18n';

type Rsvp = 'going' | 'maybe' | 'no';

export function RsvpButtons({ eventId, current }: { eventId: string; current: Rsvp | null }) {
  const { t } = useT();
  const router = useRouter();
  const [value, setValue] = useState<Rsvp | null>(current);
  const [error, setError] = useState<string | null>(null);
  async function pick(status: Rsvp) {
    const before = value;
    setValue(status); setError(null);
    try { await api(`/api/events/${eventId}/rsvp`, { body: { status } }); router.refresh(); }
    catch (e) { setValue(before); setError(e instanceof Error ? e.message : t("Could not save")); }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label={t("Are you coming?")}>
        {([['going', t('Going')], ['maybe', t('Maybe')], ['no', t('Can’t go')]] as const).map(([v, label]) => (
          <button key={v} type="button" data-v={v} aria-pressed={value === v} onClick={() => pick(v)}>{label}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function StartCard({ eventId }: { eventId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await api(`/api/events/${eventId}/card`, { method: 'POST' }); router.refresh(); }
        catch (e) { setError(e instanceof Error ? e.message : t("Could not start the card")); }
        setBusy(false);
      }}><Icon name="sparkle" size={18} />{busy ? t("Starting…") : t("Start the group card")}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function DeleteEvent({ eventId, familyId, title }: { eventId: string; familyId: string; title: string }) {
  const { t } = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button className="btn btn-danger" onClick={() => setConfirming(true)}>{t("Delete event")}</button>;
  return (
    <div className="card-box stack" role="alertdialog" aria-label={t("Confirm delete")}>
      <p>{t("Delete “{title}” with its RSVPs and tasks? Everyone in the circle loses it.", { title })}</p>
      <div className="row">
        <button className="btn btn-danger grow" disabled={busy} onClick={async () => { setBusy(true); await api(`/api/events/${eventId}`, { method: 'DELETE' }); router.push(`/family/${familyId}`); router.refresh(); }}>{t("Yes, delete")}</button>
        <button className="btn btn-ghost grow" onClick={() => setConfirming(false)}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
