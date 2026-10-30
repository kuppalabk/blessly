'use client';
import { useRouter } from 'next/navigation';
import { useT } from './I18n';
import { LANGUAGES } from '@/lib/i18n-data';

/** Interface language for visitors (and a shortcut for signed-in people). */
export function LanguagePicker() {
  const router = useRouter();
  const { t, locale } = useT();
  return (
    <label className="row small" style={{ gap: 6, alignItems: 'center' }}>
      <span aria-hidden>🌐</span>
      <span className="sr-only">{t('Language')}</span>
      <select className="select" style={{ minHeight: 36, width: 'auto', fontSize: 14, padding: '0 8px' }} value={locale} aria-label={t('Language')}
        onChange={async (e) => { await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: e.target.value }), credentials: 'same-origin' }); router.refresh(); }}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
