'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from './api';
import { LANGUAGES } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';
import { monthNames, msg } from '@/lib/i18n/ui';

const RELATIONSHIPS = [msg('Mother'), msg('Father'), msg('Partner'), msg('Wife'), msg('Husband'), msg('Son'), msg('Daughter'), msg('Brother'), msg('Sister'), msg('Grandparent'), msg('Friend'), msg('Best friend'), msg('Colleague'), msg('Other')];
const KINDS = [['birthday', msg('Birthday')], ['anniversary', msg('Anniversary')], ['work_anniversary', msg('Work anniversary')], ['custom', msg('Other')]] as const;
const STAGES = [['remindGift', msg('7 days before'), msg('Gift reminder')], ['remindIdeas', msg('3 days before'), msg('Gift ideas')], ['remindDraft', msg('1 day before'), msg('Wish drafted for you')], ['remindDay', msg('On the day'), msg('Reminder to send')]] as const;

type Occ = { kind: string; label?: string | null; month: number; day: number; remindGift: boolean; remindIdeas: boolean; remindDraft: boolean; remindDay: boolean };
export type PersonInitial = { id?: string; name: string; relationship: string; phone: string | null; email: string | null; language: string; notes: string | null; occasions: Occ[]; familyId?: string | null };
export type FamilyOption = { id: string; name: string };

const blankOcc = (): Occ => ({ kind: 'birthday', month: 1, day: 1, remindGift: true, remindIdeas: true, remindDraft: true, remindDay: true });

export function PersonForm({ initial, families = [], defaultFamily = null }: { initial?: PersonInitial; families?: FamilyOption[]; defaultFamily?: string | null }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [p, setP] = useState<PersonInitial>(initial ?? { name: '', relationship: 'Friend', phone: '', email: '', language: 'en', notes: '', occasions: [blankOcc()], familyId: defaultFamily });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const setOcc = (i: number, patch: Partial<Occ>) => setP({ ...p, occasions: p.occasions.map((o, k) => (k === i ? { ...o, ...patch } : o)) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const body = { ...p, id: undefined };
      const res = initial?.id
        ? await api<{ person: { id: string } }>(`/api/people/${initial.id}`, { method: 'PUT', body })
        : await api<{ person: { id: string } }>('/api/people', { body });
      router.push(`/people/${res.person.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not save"));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack-lg" noValidate>
      <div className="stack">
        <label className="field">{t("Name")}<input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required aria-invalid={!!fields.name} />
          {fields.name && <span className="error">{fields.name}</span>}
        </label>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("Relationship")}<select className="select" aria-label={t("Relationship")} value={p.relationship} onChange={(e) => setP({ ...p, relationship: e.target.value })}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
          </label>
          <label className="field">{t("Wish language")}<select className="select" aria-label={t("Wish language")} value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
          </label>
        </div>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("Mobile (for WhatsApp and SMS)")}<input className="input" type="tel" inputMode="tel" placeholder="+44 7700 900123" value={p.phone ?? ''} onChange={(e) => setP({ ...p, phone: e.target.value })} />
          </label>
          <label className="field">{t("Email")}<input className="input" type="email" value={p.email ?? ''} onChange={(e) => setP({ ...p, email: e.target.value })} aria-invalid={!!fields.email} />
            {fields.email && <span className="error">{fields.email}</span>}
          </label>
        </div>
        <label className="field">{t("Notes for personal wishes (optional)")}<input className="input" placeholder={t("e.g. loves trekking, our Goa trip")} value={p.notes ?? ''} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </label>
      </div>

      <section className="stack" aria-labelledby="occ-h">
        <h2 id="occ-h">{t("Occasions")}</h2>
        {p.occasions.map((o, i) => (
          <fieldset key={i} className="card-box stack" style={{ margin: 0 }}>
            <legend className="sr-only">{t("Occasion")}{' '}{i + 1}</legend>
            <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>{t("Type")}<select className="select" aria-label={t("Type")} value={o.kind} onChange={(e) => setOcc(i, { kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
              </label>
              {o.kind === 'custom' && (
                <label className="field" style={{ flex: '1 1 150px' }}>{t("Name of occasion")}<input className="input" value={o.label ?? ''} onChange={(e) => setOcc(i, { label: e.target.value })} placeholder={t("e.g. Name day")} />
                </label>
              )}
              <label className="field" style={{ flex: '1 1 140px' }}>{t("Month")}<select className="select" aria-label={t("Month")} value={o.month} onChange={(e) => setOcc(i, { month: Number(e.target.value) })}>{monthNames(locale).map((m, k) => <option key={k} value={k + 1}>{m}</option>)}</select>
              </label>
              <label className="field" style={{ flex: '0 1 90px' }}>{t("Day")}<input className="input" type="number" min={1} max={31} value={o.day} onChange={(e) => setOcc(i, { day: Number(e.target.value) })} aria-invalid={!!fields[`occasions.${i}.day`]} />
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setP({ ...p, occasions: p.occasions.filter((_, k) => k !== i) })} aria-label={t('Remove occasion {n}', { n: i + 1 })}>{t("Remove")}</button>
            </div>
            {fields[`occasions.${i}.day`] && <span className="error">{fields[`occasions.${i}.day`]}</span>}
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{t("Reminders")}</span>
              {STAGES.map(([key, when, what]) => (
                <div key={key} className="row">
                  <span className="grow"><b className="small">{t(when)}</b> <span className="muted small">· {t(what)}</span></span>
                  <button type="button" role="switch" className="switch" aria-checked={o[key]} aria-label={`${t(what)}, ${t(when)}`} onClick={() => setOcc(i, { [key]: !o[key] } as Partial<Occ>)} />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {p.occasions.length < 10 && <button type="button" className="btn btn-ghost" onClick={() => setP({ ...p, occasions: [...p.occasions, blankOcc()] })}>{t("+ Add occasion")}</button>}
      </section>

      {families.length > 0 && (
        <section className="card-box stack" style={{ gap: 8 }}>
          <label className="field">{t("Share with family")}<select className="select" aria-label={t("Share with family")} value={p.familyId ?? ''} onChange={(e) => setP({ ...p, familyId: e.target.value || null })}>
              <option value="">{t("Private — only me")}</option>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <p className="muted small">{p.familyId ? t("Everyone in this circle will see this person and get their reminders. Only you can edit them.") : t("Only you can see this person and their reminders.")}</p>
        </section>
      )}

      {error && <p className="error" role="alert">{Object.keys(fields).length ? t("Please fix the highlighted fields.") : error}</p>}
      <button className="btn btn-block" disabled={busy}>{busy ? t("Saving…") : initial?.id ? t("Save changes") : t("Save person")}</button>
    </form>
  );
}
