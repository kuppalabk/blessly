'use client';
import { OccasionChips } from '@/components/occasions/OccasionPicker';
import Link from 'next/link';
import { useState } from 'react';
import { GreetingCard, ScriptFont } from '@/components/GreetingCard';
import { GREETINGS, LANGUAGES, OCCASIONS, type LanguageCode, type OccasionId } from '@/lib/i18n-data';
import { cardDesign, designOrder, type CardOverrides } from '@/lib/cards';
import { useT } from '@/components/I18n';

const PER = 24;

export function CardLibrary({ overrides = {} }: { overrides?: Record<string, CardOverrides> }) {
  const { t } = useT();
  const [occ, setOcc] = useState<OccasionId>('diwali');
  const [lang, setLang] = useState<LanguageCode>('en');
  const [name, setName] = useState('Nisha');
  const [page, setPage] = useState(0);
  const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
  const order = designOrder(overrides[occ]);
  const pages = Math.ceil(order.length / PER);
  const idx = order.slice(page * PER, (page + 1) * PER);
  return (
    <div className="stack-lg">
      <ScriptFont language={lang} />
      <OccasionChips value={occ} onChange={(id) => { setOcc(id); setPage(0); }} />
      <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 200px', maxWidth: 280 }}>{t("Recipient name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" style={{ flex: '1 1 200px', maxWidth: 280 }}>{t("Language")}<select className="select" aria-label={t("Language")} value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </label>
      </div>
      <p className="muted">{t("Showing {from}–{to} of {total}", { from: page * PER + 1, to: page * PER + idx.length, total: order.length })}</p>
      <div className="grid-cards">
        {idx.map((i) => (
          <Link key={i} href={`/create?occasion=${occ}`} className="wcard-btn" style={{ textDecoration: 'none' }}>
            <GreetingCard occasion={occ} designIndex={i} greeting={GREETINGS[occ][lang]} to={name || undefined} language={lang} rtl={rtl} />
            <span className="wcard-meta">#{i + 1} · {cardDesign(occ, i).name}</span>
          </Link>
        ))}
      </div>
      <div className="row between">
        <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("Previous")}</button>
        <span className="muted small">{t("Page {page} of {pages}", { page: page + 1, pages })}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{t("Next")}</button>
      </div>
    </div>
  );
}
