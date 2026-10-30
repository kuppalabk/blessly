'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { LANGUAGES } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';
import { regionName } from '@/lib/i18n/ui';

const COUNTRIES = ['IN', 'GB', 'US', 'AE', 'XX'];

export function SettingsForm({ user }: { user: { name: string; timezone: string; country: string; language: string } }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [s, setS] = useState(user);
  const [msg, setMsg] = useState<string | null>(null);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [user.timezone];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try { await api('/api/me', { method: 'PATCH', body: s }); setMsg(t("Saved")); router.refresh(); } catch (err) { setMsg(err instanceof Error ? err.message : t("Could not save")); }
  }
  return (
    <div className="stack-lg">
      <form onSubmit={save} className="stack card-box">
        <label className="field">{t("Name")}<input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
        <label className="field">{t("Timezone (reminders arrive at 9am here)")}<select className="select" aria-label={t("Timezone")} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>{(zones.includes(s.timezone) ? zones : [s.timezone, ...zones]).map((z) => <option key={z}>{z}</option>)}</select>
        </label>
        <label className="field">{t("Country (festival calendar)")}<select className="select" aria-label={t("Country")} value={s.country} onChange={(e) => setS({ ...s, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c} value={c}>{c === 'XX' ? t('Other') : regionName(c, locale)}</option>)}</select>
        </label>
        <label className="field">{t("Language (app and wishes)")}<select className="select" aria-label={t("Language (app and wishes)")} value={s.language} onChange={(e) => setS({ ...s, language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </label>
        {msg && <p role="status" className={msg === 'Saved' ? 'notice' : 'error'}>{msg}</p>}
        <button className="btn">{t("Save settings")}</button>
      </form>
      <button className="btn btn-ghost" onClick={async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); router.replace('/login'); router.refresh(); }}>{t("Log out")}</button>
    </div>
  );
}
