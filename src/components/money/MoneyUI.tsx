'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { CURRENCIES, formatMoney, parseAmount } from '@/lib/money';
import type { Brand } from '@/lib/giftcards';
import { useT } from '@/components/I18n';
import { PromoField } from './PromoField';

export function TestModeBanner() {
  const { t } = useT();
  return <p className="notice" role="note" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}><b>{t("Test mode.")}</b> {' '}{t("No real money moves — payments use a pretend checkout.")}</p>;
}

/** Posts to an API that returns { checkoutUrl } and goes there. */
function useCheckout() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(url: string, body: unknown) {
    setBusy(true); setError(null);
    try { const r = await api<{ checkoutUrl: string }>(url, { body }); window.location.assign(r.checkoutUrl); }
    catch (e) { setError(e instanceof Error ? e.message : t("Something went wrong")); setBusy(false); }
  }
  return { busy, error, go };
}

/* ---------------- Test checkout ---------------- */

export function TestCheckout({ id, description, amount, status, returnUrl }: { id: string; description: string; amount: string; status: string; returnUrl: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function finish(result: 'success' | 'fail') {
    setBusy(true); setError(null);
    try { const r = await api<{ status: string; returnUrl: string }>(`/api/pay/${id}`, { body: { result } }); window.location.assign(result === 'success' ? r.returnUrl : `${r.returnUrl.split('?')[0]}?payment=failed`); }
    catch (e) { setError(e instanceof Error ? e.message : t("Payment failed")); setBusy(false); }
  }
  return (
    <div className="card-box stack" style={{ maxWidth: 440, margin: '0 auto' }}>
      <TestModeBanner />
      <p className="muted small" style={{ margin: 0 }}>{t("Blessly test checkout")}</p>
      <h1 style={{ margin: 0 }}>{amount}</h1>
      <p style={{ margin: 0 }}>{description}</p>
      {status !== 'pending' ? (
        <><p className="notice">{t("This payment is {status}.", { status })}</p><a className="btn" href={returnUrl}>{t("Continue")}</a></>
      ) : (
        <>
          <div className="card-box small" style={{ background: 'var(--soft)' }}>{t("Test card 4242 4242 4242 4242 · any future date · any CVC")}</div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn btn-block" disabled={busy} onClick={() => finish('success')}>{busy ? t("Processing…") : t("Pay {amount} (test)", { amount })}</button>
          <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => finish('fail')}>{t("Simulate a declined card")}</button>
        </>
      )}
    </div>
  );
}

/* ---------------- Pots ---------------- */

export function NewPotForm({ currency, charities, celebrations, preset }: { currency: string; charities: { id: string; name: string; country: string }[]; celebrations: { id: string; title: string }[]; preset: { kind?: string; title?: string; wishlistItemId?: string; celebrationId?: string; recipientName?: string } }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ kind: preset.kind === 'fundraiser' ? 'fundraiser' : 'gift', title: preset.title ?? '', story: '', recipientName: preset.recipientName ?? '', currency, target: '', deadline: '', charityId: '', celebrationId: preset.celebrationId ?? '', wishlistItemId: preset.wishlistItemId ?? '', showAmounts: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="card-box stack" aria-label={t("Start a collection")} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try {
        const target = v.target ? parseAmount(v.target) : null;
        if (v.target && !target) throw new Error(t("Enter the target like 5000 or 49.99"));
        const { pot } = await api<{ pot: { id: string } }>('/api/pots', { body: { ...v, target } });
        router.push(`/pots/${pot.id}`);
      } catch (err) { setError(err instanceof Error ? err.message : t("Could not create")); setBusy(false); }
    }}>
      <h2 style={{ margin: 0 }}>{t("Start a collection")}</h2>
      <div className="seg" role="group" aria-label={t("Kind")} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" aria-pressed={v.kind === 'gift'} onClick={() => setV({ ...v, kind: 'gift', charityId: '' })}>{t("🎁 Group gift")}</button>
        <button type="button" aria-pressed={v.kind === 'fundraiser'} onClick={() => setV({ ...v, kind: 'fundraiser' })}>{t("💚 Fundraiser")}</button>
      </div>
      <div className="two-col" style={{ gap: 10 }}>
        <label className="field">{t("Name")}<input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={v.kind === 'gift' ? t("e.g. Leaving gift for Sam") : t("e.g. Dad’s 60th — for the cancer ward")} maxLength={100} /></label>
        <label className="field">{v.kind === 'gift' ? t("Who it’s for") : t("In honour of (optional)")}<input className="input" value={v.recipientName} onChange={(e) => setV({ ...v, recipientName: e.target.value })} maxLength={80} /></label>
        <div className="row" style={{ gap: 8 }}>
          <label className="field grow">{t("Target (optional)")}<input className="input" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} inputMode="decimal" placeholder="5000" /></label>
          <label className="field">{t("Currency")}<select className="select" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="field">{t("Closes on (optional)")}<input className="input" type="date" value={v.deadline} onChange={(e) => setV({ ...v, deadline: e.target.value })} /></label>
        {v.kind === 'fundraiser' && (
          <label className="field">{t("Charity")}<select className="select" value={v.charityId} onChange={(e) => setV({ ...v, charityId: e.target.value })}>
              <option value="">{charities.length ? t("Choose a verified charity") : t("No verified charities yet")}</option>
              {charities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.country})</option>)}
            </select>
          </label>
        )}
        {celebrations.length > 0 && (
          <label className="field">{t("Show on a celebration page (optional)")}<select className="select" value={v.celebrationId} onChange={(e) => setV({ ...v, celebrationId: e.target.value })}><option value="">{t("None")}</option>{celebrations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          </label>
        )}
      </div>
      <label className="field">{t("Message to contributors (optional)")}<textarea className="textarea" value={v.story} onChange={(e) => setV({ ...v, story: e.target.value })} maxLength={3000} style={{ minHeight: 90 }} /></label>
      <label className="check"><input type="checkbox" checked={v.showAmounts} onChange={(e) => setV({ ...v, showAmounts: e.target.checked })} /> {' '}{t("Show how much each person gave")}</label>
      {v.wishlistItemId && <p className="small muted" style={{ margin: 0 }}>{t("Linked to a wishlist item — it will show there as a group gift.")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || v.title.trim().length < 3 || (v.kind === 'fundraiser' && !v.charityId)}>{busy ? t("Creating…") : t("Create")}</button>
    </form>
  );
}

export function ContributeForm({ slug, currency, defaultName, kind }: { slug: string; currency: string; defaultName: string; kind: 'gift' | 'fundraiser' }) {
  const { t } = useT();
  const presets = currency === 'INR' ? [50000, 100000, 200000] : currency === 'AED' ? [5000, 10000, 20000] : [1000, 2500, 5000];
  const [amount, setAmount] = useState(String(presets[1] / 100));
  const [v, setV] = useState({ name: defaultName, email: '', message: '', anonymous: false });
  const { busy, error, go } = useCheckout();
  const minor = parseAmount(amount);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (minor) void go(`/api/p/${slug}/contribute`, { ...v, amount: minor }); }}>
      <div className="row-wrap" role="group" aria-label={t("Amount")}>
        {presets.map((p) => <button key={p} type="button" className="chip" aria-pressed={minor === p} onClick={() => setAmount(String(p / 100))}>{formatMoney(p, currency)}</button>)}
      </div>
      <label className="field">{t("Amount (")}{currency})<input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
      <div className="two-col" style={{ gap: 8 }}>
        <label className="field">{t("Your name")}<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} /></label>
        <label className="field">{t("Email (for a receipt)")}<input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} maxLength={200} /></label>
      </div>
      <label className="field">{t("Message (optional)")}<input className="input" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} maxLength={500} /></label>
      <label className="check"><input type="checkbox" checked={v.anonymous} onChange={(e) => setV({ ...v, anonymous: e.target.checked })} /> {' '}{t("Don’t show my name publicly")}</label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-block" disabled={busy || !minor || !v.name.trim()}>{busy ? t("Opening checkout…") : `${kind === 'fundraiser' ? t('Donate') : t('Chip in')} ${minor ? formatMoney(minor, currency) : ''}`}</button>
    </form>
  );
}

export function PotActions({ id, closed, balance }: { id: string; closed: boolean; balance: Record<string, number> }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<string>) => { setBusy(k); setError(null); try { setMsg(await fn()); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Failed")); } finally { setBusy(null); } };
  return (
    <div className="stack">
      <div className="row-wrap">
        {Object.entries(balance).filter(([, v]) => v > 0).map(([c, v]) => (
          <button key={c} type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('p' + c, async () => { await api('/api/payouts', { body: { account: `collection:${id}`, currency: c } }); return t('Payout of {amount} requested (test mode).', { amount: formatMoney(v, c) }); })}>{t("Pay out {v}", { v: formatMoney(v, c) })}</button>
        ))}
        {!closed && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('close', async () => { await api(`/api/pots/${id}`, { body: {} }); return t('Closed to new contributions.'); })}>{t("Close collection")}</button>}
      </div>
      {msg && <p className="notice" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/* ---------------- Gift cards ---------------- */

export function GiftCardShop({ brands, currency }: { brands: Brand[]; currency: string }) {
  const { t } = useT();
  const [sel, setSel] = useState<Brand | null>(null);
  const [cur, setCur] = useState(currency);
  const [value, setValue] = useState<number | null>(null);
  const [v, setV] = useState({ recipientName: '', recipientEmail: '', message: '', deliverOn: '' });
  const [promo, setPromo] = useState<string | undefined>();
  const { busy, error, go } = useCheckout();
  const values = sel?.denominations[cur as keyof Brand['denominations']] ?? [];
  return (
    <div className="stack-lg">
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {brands.map((b) => (
          <button key={b.id} type="button" className="card-box stack" aria-pressed={sel?.id === b.id} onClick={() => { setSel(b); setValue(null); }} style={{ gap: 6, textAlign: 'start', cursor: 'pointer', outline: sel?.id === b.id ? '3px solid var(--primary)' : 'none', background: `linear-gradient(150deg, ${b.color}22, var(--surface))` }}>
            <span style={{ fontSize: 30 }} aria-hidden>{b.emoji}</span><b>{b.name}</b><span className="muted small">{b.category}</span>
          </button>
        ))}
      </div>
      {sel && (
        <form className="card-box stack" aria-label={t("Buy a {name} gift card", { name: sel.name })} onSubmit={(e) => { e.preventDefault(); if (value) void go('/api/giftcards', { brand: sel.id, currency: cur, value, ...v, promoCode: promo }); }}>
          <h2 style={{ margin: 0 }}>{sel.emoji} {sel.name}</h2>
          <div className="row-wrap" role="group" aria-label={t("Value")}>
            <select className="select" aria-label={t("Currency")} value={cur} onChange={(e) => { setCur(e.target.value); setValue(null); }} style={{ width: 100 }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
            {values.map((x) => <button key={x} type="button" className="chip" aria-pressed={value === x} onClick={() => setValue(x)}>{formatMoney(x, cur)}</button>)}
          </div>
          <div className="two-col" style={{ gap: 8 }}>
            <label className="field">{t("Recipient’s name")}<input className="input" value={v.recipientName} onChange={(e) => setV({ ...v, recipientName: e.target.value })} maxLength={80} /></label>
            <label className="field">{t("Recipient’s email")}<input className="input" type="email" value={v.recipientEmail} onChange={(e) => setV({ ...v, recipientEmail: e.target.value })} maxLength={200} /></label>
            <label className="field">{t("Send on (optional — e.g. their birthday)")}<input className="input" type="date" value={v.deliverOn} onChange={(e) => setV({ ...v, deliverOn: e.target.value })} /></label>
          </div>
          <label className="field">{t("Message (optional)")}<input className="input" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} maxLength={300} /></label>
          <p className="muted small" style={{ margin: 0 }}>{sel.terms}</p>
          <PromoField purpose="giftcard" body={{ brand: sel.id, currency: cur, value }} onChange={setPromo} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy || !value || !v.recipientName || !v.recipientEmail}>{busy ? t("Opening checkout…") : t('Buy {amount} gift card', { amount: value ? formatMoney(value, cur) : '' })}</button>
        </form>
      )}
    </div>
  );
}

/* ---------------- Addresses, shop and print ---------------- */

type Address = { name: string; line1: string; line2: string; city: string; state: string; postcode: string; country: string; phone: string };
export function AddressFields({ v, set, countries }: { v: Address; set: (a: Address) => void; countries: string[] }) {
  const { t } = useT();
  return (
    <div className="two-col" style={{ gap: 8 }}>
      <label className="field">{t("Recipient’s name")}<input className="input" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} autoComplete="name" maxLength={80} /></label>
      <label className="field">{t("Address line 1")}<input className="input" value={v.line1} onChange={(e) => set({ ...v, line1: e.target.value })} autoComplete="address-line1" maxLength={120} /></label>
      <label className="field">{t("Address line 2 (optional)")}<input className="input" value={v.line2} onChange={(e) => set({ ...v, line2: e.target.value })} autoComplete="address-line2" maxLength={120} /></label>
      <label className="field">{t("Town or city")}<input className="input" value={v.city} onChange={(e) => set({ ...v, city: e.target.value })} autoComplete="address-level2" maxLength={80} /></label>
      <label className="field">{t("State / county (optional)")}<input className="input" value={v.state} onChange={(e) => set({ ...v, state: e.target.value })} autoComplete="address-level1" maxLength={80} /></label>
      <label className="field">{t("Postcode / PIN")}<input className="input" value={v.postcode} onChange={(e) => set({ ...v, postcode: e.target.value })} autoComplete="postal-code" maxLength={12} /></label>
      <label className="field">{t("Country")}<select className="select" value={v.country} onChange={(e) => set({ ...v, country: e.target.value })}>{countries.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="field">{t("Phone for the courier (optional)")}<input className="input" type="tel" value={v.phone} onChange={(e) => set({ ...v, phone: e.target.value })} maxLength={20} /></label>
    </div>
  );
}
const blankAddress = (country: string): Address => ({ name: '', line1: '', line2: '', city: '', state: '', postcode: '', country, phone: '' });

export function BuyProduct({ id, countries, stock, defaultCountry }: { id: string; countries: string[]; stock: number; defaultCountry: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [addr, setAddr] = useState(blankAddress(countries.includes(defaultCountry) ? defaultCountry : countries[0]));
  const [giftMessage, setGiftMessage] = useState('');
  const [promo, setPromo] = useState<string | undefined>();
  const { busy, error, go } = useCheckout();
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{t("Buy")}</button>;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void go('/api/shop/buy', { productId: id, quantity: qty, address: addr, giftMessage, promoCode: promo }); }}>
      <label className="field">{t("Quantity")}<select className="select" value={qty} onChange={(e) => setQty(Number(e.target.value))}>{Array.from({ length: Math.min(stock, 10) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select></label>
      <AddressFields v={addr} set={setAddr} countries={countries} />
      <label className="field">{t("Gift note (optional)")}<input className="input" value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} maxLength={300} /></label>
      <PromoField purpose="shop" body={{ productId: id, quantity: qty }} onChange={setPromo} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-sm" disabled={busy}>{busy ? t("Opening checkout…") : t("Continue to payment")}</button>
    </form>
  );
}

export function PrintOrderForm({ designId, prices, countries, defaultCountry, currency }: { designId: string; prices: Record<string, number>; countries: string[]; defaultCountry: string; currency: string }) {
  const { t } = useT();
  const [qty, setQty] = useState(1);
  const [cur, setCur] = useState(currency);
  const [addr, setAddr] = useState(blankAddress(countries.includes(defaultCountry) ? defaultCountry : 'IN'));
  const [promo, setPromo] = useState<string | undefined>();
  const { busy, error, go } = useCheckout();
  return (
    <form className="card-box stack" onSubmit={(e) => { e.preventDefault(); void go(`/api/designs/${designId}/print`, { quantity: qty, address: addr, currency: cur, promoCode: promo }); }}>
      <div className="row-wrap">
        <label className="field">{t("How many")}<input className="input" type="number" min={1} max={50} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} style={{ width: 90 }} /></label>
        <label className="field">{t("Currency")}<select className="select" value={cur} onChange={(e) => setCur(e.target.value)}>{Object.keys(prices).map((c) => <option key={c}>{c}</option>)}</select></label>
        <p style={{ margin: '22px 0 0' }}><b>{formatMoney(prices[cur] * qty, cur)}</b> <span className="muted small">{t("({v} each, printed on 350gsm card with an envelope, postage included)", { v: formatMoney(prices[cur], cur) })}</span></p>
      </div>
      <h3 style={{ margin: 0 }}>{t("Post it to")}</h3>
      <AddressFields v={addr} set={setAddr} countries={countries} />
      <PromoField purpose="print" body={{ designId, quantity: qty, currency: cur }} onChange={setPromo} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? t("Opening checkout…") : t("Continue to payment")}</button>
    </form>
  );
}

/* ---------------- Partner portal ---------------- */

export function PartnerApply({ kind, country }: { kind: 'seller' | 'designer' | 'charity'; country: string }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ name: '', country, website: '', regNumber: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = { seller: t('Sell gifts in the Blessly shop'), designer: t('Publish your card designs'), charity: t('Receive donations from fundraisers') }[kind];
  return (
    <form className="card-box stack" aria-label={t("Apply as a {kind}", { kind })} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api('/api/partners', { body: { kind, ...v } }); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : t("Could not apply")); } finally { setBusy(false); }
    }}>
      <h3 style={{ margin: 0 }}>{label}</h3>
      <div className="two-col" style={{ gap: 8 }}>
        <label className="field">{kind === 'charity' ? t("Charity name") : kind === 'seller' ? t("Shop name") : t("Studio or artist name")}<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} /></label>
        <label className="field">{t("Country code")}<input className="input" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} /></label>
        <label className="field">{t("Website (optional)")}<input className="input" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value.trim() })} placeholder={t("https://")} /></label>
        {kind !== 'designer' && <label className="field">{kind === 'charity' ? t("Registration number") : t("Business registration / GST (optional)")}<input className="input" value={v.regNumber} onChange={(e) => setV({ ...v, regNumber: e.target.value })} maxLength={80} /></label>}
      </div>
      <label className="field">{t("About you")}<textarea className="textarea" style={{ minHeight: 70 }} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || v.name.trim().length < 2}>{busy ? t("Sending…") : t("Apply")}</button>
    </form>
  );
}

export function AddProductForm({ currency }: { currency: string }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ title: '', description: '', price: '', currency, stock: '10', countries: 'IN' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="stack" aria-label={t("Add a product")} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api('/api/partners/products', { body: { ...v, price: parseAmount(v.price), stock: Number(v.stock) } }); setV({ ...v, title: '', description: '', price: '' }); router.refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : t("Could not add")); } finally { setBusy(false); }
    }}>
      <div className="two-col" style={{ gap: 8 }}>
        <label className="field">{t("Product")}<input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={120} /></label>
        <div className="row" style={{ gap: 6 }}>
          <label className="field grow">{t("Price")}<input className="input" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} inputMode="decimal" /></label>
          <label className="field">{t("Currency")}<select className="select" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="field">{t("In stock")}<input className="input" type="number" min={0} value={v.stock} onChange={(e) => setV({ ...v, stock: e.target.value })} /></label>
        <label className="field">{t("Delivers to (country codes)")}<input className="input" value={v.countries} onChange={(e) => setV({ ...v, countries: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder={t("IN,GB")} /></label>
      </div>
      <label className="field">{t("Description")}<textarea className="textarea" style={{ minHeight: 60 }} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !v.title || !parseAmount(v.price)}>{t("Add product (sent for review)")}</button>
    </form>
  );
}

export function SellerOrderActions({ id, status }: { id: string; status: string }) {
  const { t } = useT();
  const router = useRouter();
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async (s: 'shipped' | 'delivered') => { setError(null); try { await api(`/api/partners/orders/${id}`, { method: 'PUT', body: { status: s, tracking } }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Failed")); } };
  if (status === 'delivered') return <span className="badge badge-green">{t("Delivered")}</span>;
  return (
    <div className="row-wrap">
      {status === 'paid' && <><input className="input" aria-label={t("Tracking number")} placeholder={t("Tracking number")} value={tracking} onChange={(e) => setTracking(e.target.value)} style={{ width: 160 }} /><button type="button" className="btn btn-sm" onClick={() => send('shipped')}>{t("Mark shipped")}</button></>}
      {status === 'shipped' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => send('delivered')}>{t("Mark delivered")}</button>}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

export function UploadButton({ url, field, label, extra }: { url: string; field: string; label: string; extra?: Record<string, string> }) {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="stack" style={{ gap: 4 }}>
      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>{busy ? t("Uploading…") : label}
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true); setError(null);
          const fd = new FormData(); fd.append(field, f); for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
          const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? t("Upload failed")); else router.refresh();
          setBusy(false); e.target.value = '';
        }} aria-label={label} />
      </label>
      {error && <span className="error small" role="alert">{error}</span>}
    </span>
  );
}

export function DesignSubmit() {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('birthday');
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="two-col" style={{ gap: 8 }}>
        <label className="field">{t("Design name")}<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label>
        <label className="field">{t("Occasion")}<select className="select" value={occasion} onChange={(e) => setOccasion(e.target.value)}><OccasionOptions /></select></label>
      </div>
      {title.trim().length >= 2 ? <UploadButton url="/api/partners/designs" field="image" label={t("Upload design (3:4, at least 900 px wide)")} extra={{ title, occasion }} /> : <p className="muted small" style={{ margin: 0 }}>{t("Name your design, then upload it.")}</p>}
    </div>
  );
}

export function PayoutButton({ account, currency, amount }: { account: string; currency: string; amount: number }) {
  const { t } = useT();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row-wrap">
      <button type="button" className="btn btn-sm" onClick={async () => { try { await api('/api/payouts', { body: { account, currency } }); setMsg(t("Payout requested (test mode).")); router.refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : t("Failed")); } }}>{t("Pay out {v}", { v: formatMoney(amount, currency) })}</button>
      {msg && <span className="small">{msg}</span>}
    </span>
  );
}

/* ---------------- Admin ---------------- */

export function AdminMoneyAction({ body, label, confirmText, danger }: { body: Record<string, unknown>; label: string; confirmText?: string; danger?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className={`btn btn-sm ${danger ? 'btn-ghost' : ''}`} disabled={busy} onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true); setError(null);
        try { await api('/api/admin/money', { body }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : t("Failed")); } finally { setBusy(false); }
      }}>{label}</button>
      {error && <span className="error small"> {error}</span>}
    </span>
  );
}
