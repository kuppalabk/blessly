'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';
import { regionName } from '@/lib/i18n/ui';

const COUNTRIES = [['IN', 'India'], ['GB', 'United Kingdom'], ['US', 'United States'], ['AE', 'United Arab Emirates']];

export function BusinessDetails({ initial }: { initial: { name: string; timezone: string; country: string } }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [v.timezone];
  return (
    <form className="card-box stack" aria-label={t("Business details")} onSubmit={async (e) => {
      e.preventDefault(); setMsg(null);
      try { await api('/api/business', { method: 'PATCH', body: v }); setMsg({ ok: true, text: t('Saved') }); router.refresh(); }
      catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : t('Could not save') }); }
    }}>
      <h2 style={{ fontSize: 19 }}>{t("Business details")}</h2>
      <label className="field">{t("Business name (shown in messages)")}<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} /></label>
      <label className="field">{t("Timezone")}<select className="select" aria-label={t("Timezone")} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{(zones.includes(v.timezone) ? zones : [v.timezone, ...zones]).map((z) => <option key={z}>{z}</option>)}</select></label>
      <label className="field">{t("Country")}<select className="select" aria-label={t("Country")} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })}>{(COUNTRIES.some(([c]) => c === v.country) ? COUNTRIES : [[v.country, v.country], ...COUNTRIES]).map(([c]) => <option key={c} value={c}>{regionName(c, locale)}</option>)}</select></label>
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn">{t("Save")}</button>
    </form>
  );
}
