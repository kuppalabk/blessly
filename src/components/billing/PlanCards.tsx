'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export type PlanView = { id: string; name: string; inrMonthly: number; inrYearly: number; usdMonthly: number; usdYearly: number; maxFamilyMembers: number; maxAlbums: number; maxPhotosPerAlbum: number; businessMessages: number; businessSeats: number };

const fmt = (amount: number, currency: 'INR' | 'USD') =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);

function features(p: PlanView, { t, tp }: { t: (s: string, v?: Record<string, string | number>) => string; tp: (n: number, a: string, b: string) => string }) {
  const f = [
    t('Reminders, AI wishes in 32 languages, 250 cards per occasion'),
    t('Family circle of up to {n} people', { n: p.maxFamilyMembers }),
    p.maxAlbums >= 100 ? t('Unlimited photo albums, {photos} photos each', { photos: p.maxPhotosPerAlbum }) : `${tp(p.maxAlbums, '{n} photo album', '{n} photo albums')}, ${t('{photos} photos each', { photos: p.maxPhotosPerAlbum })}`
  ];
  if (p.businessMessages) f.push(t('Business: {n} customer wishes a month on WhatsApp and email', { n: p.businessMessages.toLocaleString() }), t('{n} team logins', { n: p.businessSeats }));
  return f;
}

/** Pricing cards. With `currentPlan` set, shows choose/cancel buttons; without, links to sign-up. */
export function PlanCards({ plans, defaultCurrency, currentPlan, cancelAtPeriodEnd, periodEnd }: { plans: PlanView[]; defaultCurrency: 'INR' | 'USD'; currentPlan?: string; cancelAtPeriodEnd?: boolean; periodEnd?: string | null }) {
  const { t, tp, intl } = useT();
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [currency, setCurrency] = useState<'INR' | 'USD'>(defaultCurrency);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(!!cancelAtPeriodEnd);
  const price = (p: PlanView) => currency === 'INR' ? (interval === 'month' ? p.inrMonthly : p.inrYearly) : (interval === 'month' ? p.usdMonthly : p.usdYearly);
  async function choose(planId: string) {
    setBusy(planId); setError(null);
    try { const r = await api<{ url: string }>('/api/billing/checkout', { body: { planId, interval, currency } }); window.location.assign(r.url); }
    catch (e) { setError(e instanceof Error ? e.message : t("Could not open the payment page")); setBusy(null); }
  }
  async function cancel() {
    if (!window.confirm(t("Cancel your plan? It keeps working until the end of the period you paid for."))) return;
    setBusy('cancel'); setError(null);
    try { await api('/api/billing/cancel', { method: 'POST' }); setCancelled(true); } catch (e) { setError(e instanceof Error ? e.message : t("Could not cancel")); }
    setBusy(null);
  }
  return (
    <div className="stack-lg">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="row" role="group" aria-label={t("Billing period")} style={{ gap: 6 }}>
          <button type="button" className="chip" aria-pressed={interval === 'month'} onClick={() => setBillingInterval('month')}>{t("Monthly")}</button>
          <button type="button" className="chip" aria-pressed={interval === 'year'} onClick={() => setBillingInterval('year')}>{t("Yearly · save 20%")}</button>
        </div>
        <div className="row" role="group" aria-label={t("Currency")} style={{ gap: 6 }}>
          <button type="button" className="chip" aria-pressed={currency === 'INR'} onClick={() => setCurrency('INR')}>{t("₹ INR")}</button>
          <button type="button" className="chip" aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>{t("$ USD")}</button>
        </div>
      </div>
      <div className="plan-grid">
        {plans.map((p) => {
          const isCurrent = currentPlan === p.id;
          return (
            <section key={p.id} className={`card-box stack plan ${p.id === 'family' ? 'plan-pop' : ''}`} aria-label={t("{name} plan", { name: p.name })}>
              {p.id === 'family' && <span className="badge badge-purple" style={{ alignSelf: 'flex-start' }}>{t("Most popular")}</span>}
              <h2>{p.name}</h2>
              <p><b style={{ fontFamily: 'var(--font-display)', fontSize: 32 }}>{price(p) ? fmt(price(p), currency) : t("Free")}</b>{price(p) ? <span className="muted"> / {interval === 'month' ? t("month") : t("year")}</span> : null}</p>
              <ul className="stack small" style={{ margin: 0, paddingInlineStart: 18, gap: 6 }}>{features(p, { t, tp }).map((f) => <li key={f}>{f}</li>)}</ul>
              <div style={{ marginTop: 'auto' }}>
                {currentPlan === undefined ? (
                  <Link className={`btn btn-block ${p.id === 'family' ? '' : 'btn-ghost'}`} href="/signup">{p.id === 'free' ? t("Start free") : t("Try {name}", { name: p.name })}</Link>
                ) : isCurrent ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>{t("Your plan")}</span>
                    {p.id !== 'free' && (cancelled
                      ? <p className="small muted">{t("Cancelled — works until")}{' '}{periodEnd ? new Date(periodEnd).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' }) : t("the end of the period")}.</p>
                      : <button className="btn btn-ghost btn-block" onClick={cancel} disabled={!!busy}>{t("Cancel plan")}</button>)}
                  </div>
                ) : p.id === 'free' ? null : (
                  <button className={`btn btn-block ${p.id === 'family' ? '' : 'btn-dark'}`} onClick={() => choose(p.id)} disabled={!!busy}>{busy === p.id ? t("Opening payment…") : t("Choose {name}", { name: p.name })}</button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small" style={{ textAlign: 'center' }}>{currency === 'INR' ? t("Pay with UPI AutoPay, cards or netbanking through Razorpay.") : t("Pay by card through Stripe.")}{' '}{t("Cancel any time; your plan works until the end of the paid period. Taxes may apply.")}</p>
    </div>
  );
}
