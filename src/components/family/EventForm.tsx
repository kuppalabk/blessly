'use client';
import { useRouter } from 'next/navigation';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { OCCASIONS } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';

export type EventInitial = { title: string; occasion: string; eventDate: string; eventTime: string | null; place: string | null; notes: string | null; personId: string | null };
type Person = { id: string; name: string };


export function EventForm({ familyId, people, eventId, initial, today }: { familyId: string; people: Person[]; eventId?: string; initial?: EventInitial; today: string }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState<EventInitial>(initial ?? { title: '', occasion: 'birthday', eventDate: today, eventTime: '', place: '', notes: '', personId: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const res = eventId
        ? await api<{ event: { id: string } }>(`/api/events/${eventId}`, { method: 'PUT', body: v })
        : await api<{ event: { id: string } }>(`/api/families/${familyId}/events`, { body: v });
      router.push(`/family/events/${res.event.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not save"));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack" aria-label={eventId ? t("Edit event") : t("Add a family event")} noValidate>
      <label className="field">{t("What’s happening")}<input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={t("e.g. Dadi’s 80th birthday dinner")} maxLength={80} aria-invalid={!!fields.title} />
        {fields.title && <span className="error">{fields.title}</span>}
      </label>
      <div className="two-col" style={{ gap: 12 }}>
        <label className="field">{t("Occasion")}<select className="select" aria-label={t("Occasion")} value={v.occasion} onChange={(e) => setV({ ...v, occasion: e.target.value })}>
            <OccasionOptions />
          </select>
        </label>
        <label className="field">{t("For (optional)")}<select className="select" aria-label={t("For")} value={v.personId ?? ''} onChange={(e) => setV({ ...v, personId: e.target.value || null })}>
            <option value="">{t("The whole family")}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="two-col" style={{ gap: 12 }}>
        <label className="field">{t("Date")}<input className="input" type="date" aria-label={t("Date")} value={v.eventDate} onChange={(e) => setV({ ...v, eventDate: e.target.value })} aria-invalid={!!fields.eventDate} />
          {fields.eventDate && <span className="error">{fields.eventDate}</span>}
        </label>
        <label className="field">{t("Time (optional)")}<input className="input" type="time" aria-label={t("Time")} value={v.eventTime ?? ''} onChange={(e) => setV({ ...v, eventTime: e.target.value })} aria-invalid={!!fields.eventTime} />
          {fields.eventTime && <span className="error">{fields.eventTime}</span>}
        </label>
      </div>
      <label className="field">{t("Where (optional)")}<input className="input" value={v.place ?? ''} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder={t("e.g. Nani’s house")} maxLength={120} />
      </label>
      <label className="field">{t("Notes (optional)")}<textarea className="textarea" style={{ minHeight: 80 }} value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={500} />
      </label>
      {error && <p className="error" role="alert">{Object.keys(fields).length ? t("Please fix the highlighted fields.") : error}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Saving…") : eventId ? t("Save changes") : t("Add event")}</button>
    </form>
  );
}
