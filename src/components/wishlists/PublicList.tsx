'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/components/api';
import { formatMoney } from '@/lib/money';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

type Item = { id: string; title: string; url: string | null; price: string | null; notes: string | null; priority: number; quantity: number; imageUrl: string | null; remaining: number | null };
type Mine = { itemId: string; token: string; quantity: number; purchased: boolean };
const PRIORITY: Record<number, string> = { 1: msg('Must have'), 2: msg('Would love'), 3: msg('Nice to have') };
const key = (slug: string) => `ww_l_${slug}`;
const load = (slug: string): string[] => { try { return JSON.parse(localStorage.getItem(key(slug)) ?? '[]'); } catch { return []; } };
const store = (slug: string, tokens: string[]) => { try { localStorage.setItem(key(slug), JSON.stringify(tokens.slice(-100))); } catch { /* private mode */ } };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Error');
  return json;
}

type Pot = { slug: string; title: string; wishlistItemId: string | null; raised: number; target: number | null; currency: string };
export function PublicList({ slug, items, isOwner, ownerName, defaultName, money = false, pots = [] }: { slug: string; items: Item[]; isOwner: boolean; ownerName: string; defaultName: string; money?: boolean; pots?: Pot[] }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [mine, setMine] = useState<Mine[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = ownerName.split(' ')[0];

  const refreshMine = useCallback(async () => {
    const tokens = load(slug);
    if (!tokens.length) { setMine([]); return; }
    const r = await call(`/api/l/${slug}/mine`, 'POST', { tokens }).catch(() => ({ reservations: [] }));
    setMine(r.reservations);
    store(slug, (r.reservations as Mine[]).map((x) => x.token));
  }, [slug]);
  useEffect(() => { void refreshMine(); }, [refreshMine]);

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); await refreshMine(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : tr("Something went wrong")); } finally { setBusy(false); }
  }

  return (
    <ul className="list" aria-label={tr("Wishlist")}>
      {items.length === 0 && <li className="muted">{tr("Nothing on this list yet.")}</li>}
      {items.map((i) => {
        const my = mine.filter((m) => m.itemId === i.id);
        const gone = i.remaining === 0 && !my.length;
        return (
          <li key={i.id} className="item stack" style={{ alignItems: 'stretch', opacity: gone ? 0.6 : 1 }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              {i.imageUrl ? <img src={i.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} /> : <span aria-hidden style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--soft)', display: 'grid', placeItems: 'center', fontSize: 30 }}>🎁</span>}
              <div className="grow stack" style={{ gap: 4 }}>
                <b>{i.title}</b>
                <span className="small muted">{[tr(PRIORITY[i.priority]), i.price, i.quantity > 1 ? tr('wants {n}', { n: i.quantity }) : null].filter(Boolean).join(' · ')}</span>
                {i.notes && <span className="small">{i.notes}</span>}
                {i.url && <a className="small" href={i.url} target="_blank" rel="noopener noreferrer nofollow">{tr("See it at {v}", { v: new URL(i.url).hostname.replace(/^www\./, '') })}</a>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {my.length > 0 ? <span className="badge badge-green">{tr("You’re getting this")}</span>
                  : isOwner ? null
                  : gone ? <span className="badge">{tr("Already taken")}</span>
                  : <button type="button" className="btn btn-sm" onClick={() => { setOpen(open === i.id ? null : i.id); setQty(1); setError(null); }} aria-expanded={open === i.id}>{tr("I’ll get this")}</button>}
                {!isOwner && i.remaining !== null && i.remaining > 0 && i.quantity > 1 && <div className="small muted">{tr("{remaining} of {quantity} left", { remaining: i.remaining, quantity: i.quantity })}</div>}
              </div>
            </div>
            {pots.filter((p) => p.wishlistItemId === i.id).map((p) => <a key={p.slug} className="small" href={`/p/${p.slug}`}>{p.target ? tr("💝 Group gift: {raised} raised of {target} — chip in", { raised: formatMoney(p.raised, p.currency), target: formatMoney(p.target, p.currency) }) : tr("💝 Group gift: {raised} raised — chip in", { raised: formatMoney(p.raised, p.currency) })}</a>)}
            {money && !isOwner && !gone && !pots.some((p) => p.wishlistItemId === i.id) && <a className="small" href={`/pots?item=${i.id}&title=${encodeURIComponent(`${i.title} for ${first}`)}&for=${encodeURIComponent(first)}`}>{tr("Too pricey alone? Start a group gift")}</a>}
            {my.map((m) => (
              <div key={m.token} className="row-wrap small" style={{ gap: 6 }}>
                <span>{m.quantity > 1 ? tr("{quantity} reserved by you.", { quantity: m.quantity }) : tr("Reserved by you.")} {tr("{name} won’t see who.", { name: first })}</span>
                <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" checked={m.purchased} disabled={busy} onChange={(e) => { const v = e.target.checked; setMine((xs) => xs.map((x) => (x.token === m.token ? { ...x, purchased: v } : x))); void act(() => call(`/api/l/reservations/${m.token}`, 'PUT', { purchased: v })); }} /> {' '}{tr("Bought it")}</label>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(async () => { await call(`/api/l/reservations/${m.token}`, 'DELETE'); store(slug, load(slug).filter((t) => t !== m.token)); })}>{tr("Undo")}</button>
              </div>
            ))}
            {open === i.id && (
              <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call(`/api/l/${slug}/reserve`, 'POST', { itemId: i.id, name, email, quantity: qty }); store(slug, [...load(slug), r.token]); setOpen(null); }); }}>
                <p className="small muted" style={{ margin: 0 }}>{tr("Reserve it so nobody else buys the same thing. {first} won’t see who.", { first })}</p>
                <div className="two-col" style={{ gap: 8 }}>
                  <label className="field">{tr("Your name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
                  <label className="field">{tr("Email (optional, for a thank-you)")}<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></label>
                </div>
                {(i.remaining ?? 1) > 1 && <label className="field">{tr("How many")}<select className="select" value={qty} onChange={(e) => setQty(Number(e.target.value))}>{Array.from({ length: i.remaining ?? 1 }, (_, k) => k + 1).map((n) => <option key={n}>{n}</option>)}</select></label>}
                <button type="submit" className="btn btn-sm" disabled={busy || !name.trim()}>{busy ? tr("Reserving…") : tr("Reserve")}</button>
              </form>
            )}
            {error && open === i.id && <p className="error" role="alert">{error}</p>}
          </li>
        );
      })}
    </ul>
  );
}
