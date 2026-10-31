'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

export type OwnerItem = { id: string; title: string; url: string | null; price: string | null; priceMinor: number | null; currency: string | null; notes: string | null; priority: number; quantity: number; imageUrl: string | null; taken: number | null; reservations: { id: string; name: string; quantity: number; purchased: boolean; thanked: boolean; hasEmail: boolean }[] };
type Props = { id: string; slug: string; title: string; surprise: boolean; hidden: boolean; reservedCount: number; appUrl: string; items: OwnerItem[]; defaultCurrency: string };

export const PRIORITY: Record<number, string> = { 1: msg('Must have'), 2: msg('Would love'), 3: msg('Nice to have') };
const CUR = ['INR', 'USD', 'GBP', 'EUR', 'AED'];

export function WishlistEditor(p: Props) {
  const { t, tp } = useT();
  const router = useRouter();
  const blank = { title: '', url: '', price: '', currency: p.defaultCurrency, notes: '', priority: 2, quantity: 1 };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [thanks, setThanks] = useState(t('Thank you so much for the lovely gift — it means a lot!'));
  const [copied, setCopied] = useState(false);
  const link = `${p.appUrl}/l/${p.slug}`;

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setError(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong")); } finally { setBusy(null); }
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run('save', async () => {
      if (editing) await api(`/api/wishlists/${p.id}/items/${editing}`, { method: 'PUT', body: form });
      else await api(`/api/wishlists/${p.id}/items`, { body: form });
      setForm(blank); setEditing(null);
    });
  };
  async function photo(itemId: string, file: File | undefined) {
    if (!file) return;
    await run('ph' + itemId, async () => {
      const fd = new FormData(); fd.append('photo', file);
      const res = await fetch(`/api/wishlists/${p.id}/items/${itemId}/photo`, { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? t('Upload failed'));
    });
  }

  return (
    <div className="stack-lg">
      <section className="card-box stack" aria-label={t("Share")}>
        <div className="link-box"><span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="wishlist-link">{link}</span>
          <button type="button" className="btn btn-sm" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? t("Copied") : t("Copy")}</button></div>
        <div className="row-wrap">
          <a className="btn btn-ghost btn-sm" href={`/l/${p.slug}`} target="_blank" rel="noopener noreferrer">{t("View as a friend")}</a>
          <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`My wishlist: ${p.title} ${link}`)}`} target="_blank" rel="noopener noreferrer">{t("Share on WhatsApp")}</a>
          <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" checked={p.surprise} onChange={(e) => run('sur', () => api(`/api/wishlists/${p.id}`, { method: 'PUT', body: { surprise: e.target.checked } }).then(() => undefined))} /> {' '}{t("Keep it a surprise")}</label>
        </div>
        {p.hidden
          ? <div className="stack" style={{ gap: 8 }}>
              <p className="muted small" style={{ margin: 0 }}>🤫 {p.reservedCount ? tp(p.reservedCount, '{n} gift has been reserved', '{n} gifts have been reserved') : t("Nothing reserved yet")}{' '}{t("— you won’t see what until you choose to look.")}</p>
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={() => { if (confirm(t("See who reserved what? This spoils the surprise."))) void run('rev', () => api(`/api/wishlists/${p.id}/reveal`, { body: {} }).then(() => undefined)); }}>{t("Reveal my gifts")}</button>
            </div>
          : p.reservedCount > 0 && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('thx', async () => { const r = await api<{ emailed: number }>(`/api/wishlists/${p.id}/thanks`, { body: { message: thanks } }); return tp(r.emailed, 'Thank-you emailed to {n} person', 'Thank-you emailed to {n} people'); }); }}>
              <label className="field">{t("Say thank you (emailed once to everyone who left an email)")}<textarea className="textarea" style={{ minHeight: 70 }} value={thanks} onChange={(e) => setThanks(e.target.value)} maxLength={2000} /></label>
              <button type="submit" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy === 'thx'}>{t("Send thank-yous")}</button>
            </form>
          )}
      </section>

      <form className="card-box stack" onSubmit={save} aria-label={editing ? t("Edit item") : t("Add an item")}>
        <h2 style={{ margin: 0 }}>{editing ? t("Edit item") : t("Add something you’d love")}</h2>
        <div className="two-col" style={{ gap: 10 }}>
          <label className="field">{t("What is it?")}<input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} required /></label>
          <label className="field">{t("Link to the shop (optional)")}<input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value.trim() })} inputMode="url" placeholder={t("https://…")} /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field grow">{t("Price (optional)")}<input className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" placeholder="1499" /></label>
            <label className="field">{t("Currency")}<select className="select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field grow">{t("How much you want it")}<select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{t(PRIORITY[n])}</option>)}</select></label>
            <label className="field">{t("How many")}<input className="input" type="number" min={1} max={20} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} style={{ width: 80 }} /></label>
          </div>
        </div>
        <label className="field">{t("Notes — size, colour, model (optional)")}<input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></label>
        <div className="row-wrap">
          <button type="submit" className="btn btn-sm" disabled={busy === 'save' || !form.title.trim()}>{editing ? t("Save") : t("Add to list")}</button>
          {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm(blank); }}>{t("Cancel")}</button>}
        </div>
      </form>
      {msg && <p className="notice" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <ul className="list" aria-label={t("Items")}>
        {p.items.length === 0 && <li className="muted">{t("Your list is empty.")}</li>}
        {p.items.map((i, k) => (
          <li key={i.id} className="item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {i.imageUrl ? <img src={i.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--soft)', display: 'grid', placeItems: 'center', fontSize: 26 }} aria-hidden>🎁</span>}
            <div className="grow stack" style={{ gap: 4, minWidth: 160 }}>
              <b>{i.title}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</b>
              <span className="small muted">{[t(PRIORITY[i.priority]), i.price, i.notes].filter(Boolean).join(' · ')}</span>
              {i.url && <a className="small" href={i.url} target="_blank" rel="noopener noreferrer nofollow">{new URL(i.url).hostname}</a>}
              {i.taken !== null && <span className="small">{i.taken ? `${t('Reserved {taken} of {quantity}', { taken: i.taken, quantity: i.quantity })}${i.reservations.length ? ` — ${i.reservations.map((r) => `${r.name}${r.purchased ? ` (${t('bought')})` : ''}`).join(', ')}` : ''}` : t("Not reserved yet")}</span>}
            </div>
            <div className="row-wrap" style={{ gap: 4 }}>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={t("Move {title} up", { title: i.title })} disabled={k === 0 || !!busy} onClick={() => run('mv', () => api(`/api/wishlists/${p.id}/items/${i.id}`, { method: 'PUT', body: { move: 'up' } }).then(() => undefined))}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={t("Move {title} down", { title: i.title })} disabled={k === p.items.length - 1 || !!busy} onClick={() => run('mv', () => api(`/api/wishlists/${p.id}/items/${i.id}`, { method: 'PUT', body: { move: 'down' } }).then(() => undefined))}>↓</button>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>{t("Photo")}<input type="file" accept="image/*" hidden onChange={(e) => photo(i.id, e.target.files?.[0])} aria-label={t("Photo for {title}", { title: i.title })} /></label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(i.id); setForm({ title: i.title, url: i.url ?? '', price: i.priceMinor != null ? String(i.priceMinor / 100) : '', currency: i.currency ?? p.defaultCurrency, notes: i.notes ?? '', priority: i.priority, quantity: i.quantity }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t("Edit")}</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={t("Delete {title}", { title: i.title })} disabled={!!busy} onClick={() => run('del', () => api(`/api/wishlists/${p.id}/items/${i.id}`, { method: 'DELETE' }).then(() => undefined))}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { if (confirm(t("Delete this wishlist?"))) void run('dl', async () => { await api(`/api/wishlists/${p.id}`, { method: 'DELETE' }); router.push('/wishlists'); }); }}>{t("Delete wishlist")}</button>
    </div>
  );
}
