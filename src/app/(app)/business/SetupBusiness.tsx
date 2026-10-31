'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { useT } from '@/components/I18n';
import { regionName } from '@/lib/i18n/ui';

const COUNTRIES = [['IN', 'India'], ['GB', 'United Kingdom'], ['US', 'United States'], ['AE', 'United Arab Emirates']];

export function SetupBusiness({ timezone, country }: { timezone: string; country: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [v, setV] = useState({ name: '', timezone, country: COUNTRIES.some(([c]) => c === country) ? country : 'IN' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [timezone];
  return (
    <form className="card-box stack" aria-label={t("Set up your business")} noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null); setFields({});
      try { await api('/api/business', { body: v }); router.refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : t("Could not save")); if (err instanceof ApiError && err.fields) setFields(err.fields); setBusy(false); }
    }}>
      <label className="field">{t("Business name")}<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t("e.g. Sweet Treats Bakery")} maxLength={80} aria-invalid={!!fields.name} />
        {fields.name && <span className="error">{fields.name}</span>}
      </label>
      <div className="two-col" style={{ gap: 12 }}>
        <label className="field">{t("Timezone (messages go out in this time)")}<select className="select" aria-label={t("Timezone")} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{(zones.includes(v.timezone) ? zones : [v.timezone, ...zones]).map((z) => <option key={z}>{z}</option>)}</select>
        </label>
        <label className="field">{t("Country (for phone numbers without a code)")}<select className="select" aria-label={t("Country")} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })}>{COUNTRIES.map(([c]) => <option key={c} value={c}>{regionName(c, locale)}</option>)}</select>
        </label>
      </div>
      {error && !Object.keys(fields).length && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Setting up…") : t("Create business workspace")}</button>
    </form>
  );
}
