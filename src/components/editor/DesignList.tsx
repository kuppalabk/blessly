'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/components/api';
import { SCRIPT_FONT } from '@/components/GreetingCard';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import type { Page } from '@/lib/card-doc';
import { drawPage, loadFonts, preload } from '@/lib/card-render';
import { LANGUAGES, type OccasionId } from '@/lib/i18n-data';
import { occasionLabel } from '@/lib/occasion-groups';
import { useT } from '@/components/I18n';

type Item = { id: string; title: string; occasion: string; favourite: boolean; updatedAt: string; page: Page; language: string; urls: Record<string, string> };

/** A small live drawing of a card's front. */
export function CardThumb({ page, urls, language, label }: { page: Page; urls: Record<string, string>; language: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const opts = { rtl: LANGUAGES.find((l) => l.code === language)?.rtl, scriptFont: SCRIPT_FONT[language], dpr: Math.min(window.devicePixelRatio || 1, 2) };
    const draw = () => live && ref.current && drawPage(ref.current, page, urls, ref.current.clientWidth || 200, opts);
    draw();
    Promise.all([preload(page, urls), loadFonts([page], opts.scriptFont)]).then(draw);
    return () => { live = false; };
  }, [page, urls, language]);
  return <canvas ref={ref} role="img" aria-label={label} />;
}

export function DesignList({ designs, name, language }: { designs: Item[]; name: string; language: string }) {
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState(designs);
  const [occasion, setOccasion] = useState<OccasionId>('birthday');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy('new'); setError(null);
    try {
      const { design } = await api<{ design: { id: string } }>('/api/designs', { body: { occasion, designIndex: Math.floor(Math.random() * 250), language: LANGUAGES.some((l) => l.code === language) ? language : 'en', from: name } });
      router.push(`/designs/${design.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not start a card")); setBusy(null); }
  }
  async function act(id: string, what: 'fav' | 'copy' | 'delete') {
    setBusy(id); setError(null);
    try {
      if (what === 'fav') {
        const it = items.find((x) => x.id === id)!;
        await api(`/api/designs/${id}`, { method: 'PUT', body: { favourite: !it.favourite } });
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, favourite: !x.favourite } : x)));
      } else if (what === 'copy') {
        const { design } = await api<{ design: { id: string } }>(`/api/designs/${id}/duplicate`, { method: 'POST', body: {} });
        router.push(`/designs/${design.id}`);
      } else {
        if (!confirm(t("Delete this card? Wishes you already sent with it will show their original design."))) return;
        await api(`/api/designs/${id}`, { method: 'DELETE' });
        setItems((xs) => xs.filter((x) => x.id !== id));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong")); } finally { setBusy(null); }
  }

  const favs = items.filter((x) => x.favourite), rest = items.filter((x) => !x.favourite);
  const grid = (xs: Item[]) => (
    <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
      {xs.map((d) => (
        <div key={d.id} className="stack" style={{ gap: 6 }}>
          <Link href={`/designs/${d.id}`} className="card-tile">
            <CardThumb page={d.page} urls={d.urls} language={d.language} label={`${d.title}`} />
            <strong style={{ fontSize: 14 }}>{d.title}</strong>
          </Link>
          <span className="muted small">{t(occasionLabel(d.occasion as OccasionId))} · {new Date(d.updatedAt).toLocaleDateString()}</span>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => act(d.id, 'fav')} aria-label={d.favourite ? t("Unfavourite {title}", { title: d.title }) : t("Favourite {title}", { title: d.title })}>{d.favourite ? '★' : '☆'}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => act(d.id, 'copy')} aria-label={t("Duplicate {title}", { title: d.title })}>{t("Copy")}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === d.id} onClick={() => act(d.id, 'delete')} aria-label={t("Delete {title}", { title: d.title })}>{t("Delete")}</button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 6 }}>
        <h1>{t("My cards")}</h1>
        <p className="muted" style={{ margin: 0 }}>{t("Design your own card: change the words, fonts and colours, add photos, stickers, a signature or a QR code — then send it with a wish or print it.")}</p>
      </header>
      <section className="card-box row-wrap" style={{ alignItems: 'end' }} aria-label={t("Start a new card")}>
        <label className="field" style={{ flex: 1, minWidth: 180 }}>{t("Occasion")}<select className="select" value={occasion} onChange={(e) => setOccasion(e.target.value as OccasionId)}><OccasionOptions /></select>
        </label>
        <button type="button" className="btn" onClick={create} disabled={busy === 'new'}>{busy === 'new' ? t("Starting…") : t("Start a new card")}</button>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      {favs.length > 0 && <section className="stack"><h2>{t("Favourites")}</h2>{grid(favs)}</section>}
      <section className="stack">
        <h2>{favs.length ? t("Other cards") : t("Your cards")}</h2>
        {rest.length ? grid(rest) : <p className="muted">{favs.length ? t("No other cards.") : t("No cards yet. Start one above, or pick a design in Create and tap “Customise this design”.")}</p>}
      </section>
    </div>
  );
}
