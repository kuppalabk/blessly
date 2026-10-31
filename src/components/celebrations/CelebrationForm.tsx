'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { GreetingCard } from '@/components/GreetingCard';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { GREETINGS, type OccasionId } from '@/lib/i18n-data';

import type { CelebrationInput } from '@/lib/celebration-form';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';
export type { CelebrationInput };

const VIS: [CelebrationInput['visibility'], string, string][] = [
  ['link', msg('Anyone with the link'), msg('Not listed anywhere; share the link with who you like.')],
  ['invite', msg('Invited guests only'), msg('Each guest gets a personal link. Nobody else can open the page.')],
  ['public', msg('Public'), msg('Anyone can open it and RSVP — good for community events.')]
];

export function CelebrationForm({ initial, id, wishlists }: { initial: CelebrationInput; id?: string; wishlists: { id: string; title: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = <K extends keyof CelebrationInput>(k: K, val: CelebrationInput[K]) => setV((x) => ({ ...x, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      if (id) {
        await api(`/api/celebrations/${id}`, { method: 'PUT', body: v });
        router.refresh();
        setBusy(false);
      } else {
        const { celebration } = await api<{ celebration: { id: string } }>('/api/celebrations', { body: v });
        router.push(`/celebrations/${celebration.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not save"));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  const f = (k: string) => fields[k] ? <span className="error small">{fields[k]}</span> : null;
  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <section className="stack" aria-labelledby="cf-what">
        <h2 id="cf-what">{t("What are you celebrating?")}</h2>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("Name of the celebration")}<input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder={t("e.g. Asha turns 30")} maxLength={100} required />{f('title')}
          </label>
          <label className="field">{t("Occasion")}<select className="select" value={v.occasion} onChange={(e) => set('occasion', e.target.value as OccasionId)}><OccasionOptions /></select>
          </label>
          <label className="field">{t("Who it’s for (optional)")}<input className="input" value={v.honoree} onChange={(e) => set('honoree', e.target.value)} placeholder={t("e.g. Asha")} maxLength={80} />
          </label>
          <label className="field">{t("Card design")}<div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('designIndex', (v.designIndex + 249) % 250)} aria-label={t("Previous design")}>‹</button>
              <span className="muted small">{t("Design {n} of 250", { n: v.designIndex + 1 })}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('designIndex', (v.designIndex + 1) % 250)} aria-label={t("Next design")}>›</button>
            </div>
          </label>
        </div>
        <div style={{ maxWidth: 200 }}><GreetingCard occasion={v.occasion} designIndex={v.designIndex} greeting={GREETINGS[v.occasion].en} to={v.honoree || undefined} /></div>
        <label className="field">{t("Message to guests (optional)")}<textarea className="textarea" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} placeholder={t("Dress code, parking, what to bring, a surprise to keep quiet about…")} />
        </label>
      </section>

      <section className="stack" aria-labelledby="cf-when">
        <h2 id="cf-when">{t("When and where")}</h2>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("Date")}<input className="input" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} required />{f('date')}</label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field grow">{t("Starts")}<input className="input" type="time" value={v.time} onChange={(e) => set('time', e.target.value)} required /></label>
            <label className="field grow">{t("Ends (optional)")}<input className="input" type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} /></label>
          </div>
          <label className="field">{t("Venue")}<input className="input" value={v.place} onChange={(e) => set('place', e.target.value)} placeholder={t("e.g. The Garden Room")} maxLength={120} /></label>
          <label className="field">{t("Address")}<input className="input" value={v.address} onChange={(e) => set('address', e.target.value)} placeholder={t("Street, town")} maxLength={300} /></label>
          <label className="field">{t("Video call link (optional)")}<input className="input" value={v.onlineUrl} onChange={(e) => set('onlineUrl', e.target.value.trim())} placeholder={t("https://meet.google.com/…")} inputMode="url" />{f('onlineUrl')}</label>
          <label className="field">{t("Time zone")}<input className="input" value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />{f('timezone')}</label>
        </div>
      </section>

      <section className="stack" aria-labelledby="cf-who">
        <h2 id="cf-who">{t("Who can see it")}</h2>
        <div className="stack" role="radiogroup" aria-label={t("Who can see it")} style={{ gap: 8 }}>
          {VIS.map(([k, label, sub]) => (
            <label key={k} className="check card-box" style={{ padding: 12 }}>
              <input type="radio" name="visibility" checked={v.visibility === k} onChange={() => set('visibility', k)} />
              <span><b>{t(label)}</b><br /><span className="muted small">{t(sub)}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="cf-rsvp">
        <h2 id="cf-rsvp">{t("Replies and guests")}</h2>
        <label className="check"><input type="checkbox" checked={v.rsvpEnabled} onChange={(e) => set('rsvpEnabled', e.target.checked)} /> {' '}{t("Ask guests if they can come (RSVP)")}</label>
        {v.rsvpEnabled && (
          <div className="two-col" style={{ gap: 12 }}>
            <label className="field">{t("Reply by (optional)")}<input className="input" type="date" value={v.rsvpDeadline} onChange={(e) => set('rsvpDeadline', e.target.value)} /></label>
            <label className="field">{t("People per invitation")}<select className="select" value={v.maxPartySize} onChange={(e) => set('maxPartySize', Number(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? t("Just the guest") : `Guest + up to ${n - 1}`}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={v.askDiet} onChange={(e) => set('askDiet', e.target.checked)} /> {' '}{t("Ask about dietary needs")}</label>
            <label className="check"><input type="checkbox" checked={v.askAccess} onChange={(e) => set('askAccess', e.target.checked)} /> {' '}{t("Ask about accessibility needs")}</label>
            <label className="check"><input type="checkbox" checked={v.showGuestList} onChange={(e) => set('showGuestList', e.target.checked)} /> {' '}{t("Show who’s coming to other guests")}</label>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={v.guestPosts} onChange={(e) => set('guestPosts', e.target.checked)} /> {' '}{t("Guests can leave messages, photos and videos")}</label>
        {v.guestPosts && <label className="check"><input type="checkbox" checked={v.moderatePosts} onChange={(e) => set('moderatePosts', e.target.checked)} /> {' '}{t("I approve messages before they appear")}</label>}
        {wishlists.length > 0 && (
          <label className="field">{t("Gift wishlist (optional)")}<select className="select" value={v.wishlistId} onChange={(e) => set('wishlistId', e.target.value)}>
              <option value="">{t("No wishlist")}</option>
              {wishlists.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
          </label>
        )}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-block" disabled={busy}>{busy ? t("Saving…") : id ? t("Save changes") : t("Create celebration page")}</button>
    </form>
  );
}
