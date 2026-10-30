'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { LANGUAGES } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export type CustomerValues = { name: string; phone: string; email: string; language: string; birthdayMonth: string; birthdayDay: string; anniversaryMonth: string; anniversaryDay: string; tags: string; consent: boolean };

function DateFields({ label, m, d, onM, onD, error }: { label: string; m: string; d: string; onM: (v: string) => void; onD: (v: string) => void; error?: string }) {
  const { t } = useT();
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
      <legend className="field" style={{ marginBottom: 6 }}>{t("{label} (optional)", { label })}</legend>
      <div className="row" style={{ gap: 8 }}>
        <select className="select" aria-label={t("{label} month", { label })} value={m} onChange={(e) => onM(e.target.value)}><option value="">{t("Month")}</option>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
        <input className="input" style={{ width: 90 }} aria-label={t("{label} day", { label })} inputMode="numeric" placeholder={t("Day")} value={d} onChange={(e) => onD(e.target.value.replace(/\D/g, '').slice(0, 2))} />
      </div>
      {error && <span className="error">{error}</span>}
    </fieldset>
  );
}

export function CustomerForm({ id, initial, consentSource }: { id?: string; initial?: CustomerValues; consentSource?: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState<CustomerValues>(initial ?? { name: '', phone: '', email: '', language: 'en', birthdayMonth: '', birthdayDay: '', anniversaryMonth: '', anniversaryDay: '', tags: '', consent: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<CustomerValues>) => setV({ ...v, ...p });
  return (
    <form className="stack-lg" noValidate aria-label={id ? t("Edit customer") : t("Add customer")} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null); setFields({});
      try {
        const res = id ? await api<{ customer: { id: string } }>(`/api/business/customers/${id}`, { method: 'PUT', body: v })
          : await api<{ customer: { id: string } }>('/api/business/customers', { body: v });
        router.push(`/business/customers/${res.customer.id}`); router.refresh();
      } catch (err) { setError(err instanceof Error ? err.message : t("Could not save")); if (err instanceof ApiError && err.fields) setFields(err.fields); setBusy(false); }
    }}>
      <div className="card-box stack">
        <label className="field">{t("Name")}<input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} aria-invalid={!!fields.name} />{fields.name && <span className="error">{fields.name}</span>}</label>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("WhatsApp / mobile")}<input className="input" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={v.phone} onChange={(e) => set({ phone: e.target.value })} aria-invalid={!!fields.phone} />{fields.phone && <span className="error">{fields.phone}</span>}</label>
          <label className="field">{t("Email")}<input className="input" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={!!fields.email} />{fields.email && <span className="error">{fields.email}</span>}</label>
        </div>
        <div className="two-col" style={{ gap: 12 }}>
          <DateFields label={t("Birthday")} m={v.birthdayMonth} d={v.birthdayDay} onM={(x) => set({ birthdayMonth: x })} onD={(x) => set({ birthdayDay: x })} error={fields.birthdayDay} />
          <DateFields label={t("Anniversary")} m={v.anniversaryMonth} d={v.anniversaryDay} onM={(x) => set({ anniversaryMonth: x })} onD={(x) => set({ anniversaryDay: x })} error={fields.anniversaryDay} />
        </div>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{t("Language")}<select className="select" aria-label={t("Language")} value={v.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
          <label className="field">{t("Tags (comma separated)")}<input className="input" placeholder={t("vip, regular")} value={v.tags} onChange={(e) => set({ tags: e.target.value })} /></label>
        </div>
      </div>
      <div className="card-box stack" style={{ gap: 8 }}>
        <label className="check"><input type="checkbox" checked={v.consent} onChange={(e) => set({ consent: e.target.checked })} />
          <span><b>{t("This customer agreed to receive messages from us")}</b><br /><span className="muted small">{t("Required by WhatsApp and email rules. Without it, nothing is sent to them.")}{consentSource ? t(" Recorded: {consentSource}.", { consentSource }) : ''}</span></span>
        </label>
      </div>
      {error && <p className="error" role="alert">{Object.keys(fields).length ? t("Please fix the highlighted fields.") : error}</p>}
      <button className="btn btn-block" disabled={busy}>{busy ? t("Saving…") : id ? t("Save changes") : t("Save customer")}</button>
    </form>
  );
}
