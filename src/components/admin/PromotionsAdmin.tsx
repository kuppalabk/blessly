'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { CURRENCIES, formatMoney, parseAmount } from '@/lib/money';

export type PromoRow = { id: string; code: string; label: string; kind: string; value: number; currency: string | null; appliesTo: string; minAmount: number; maxRedemptions: number | null; perUserLimit: number; active: boolean; endsAt: string | null; partner: string | null; used: number; saved: number };
export type AffiliateRow = { id: string; name: string; email: string; code: string; status: string; commissionPercent: number; createdAt: string; pending: Record<string, number>; paid: Record<string, number> };

const PURPOSES = [['shop', 'Shop products'], ['print', 'Printed cards'], ['giftcard', 'Gift cards']] as const;
const money = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => formatMoney(v, c)).join(' · ') || '—';
const offer = (p: PromoRow) => (p.kind === 'percent' ? `${p.value}% off` : `${formatMoney(p.value, p.currency)} off`);

export function PromotionsAdmin({ promos, affiliates }: { promos: PromoRow[]; affiliates: AffiliateRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [f, setF] = useState({ code: '', label: '', kind: 'percent', value: '10', currency: 'INR', appliesTo: ['shop', 'print', 'giftcard'] as string[], minAmount: '', maxRedemptions: '', perUserLimit: '1', endsAt: '' });
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<Record<string, string>>({});
  const [pct, setPct] = useState<Record<string, string>>({});

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null); setNotice(null);
    try { await fn(); setNotice(done); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(async () => {
      const fixed = f.kind === 'fixed';
      await api('/api/admin/promos', { body: {
        code: f.code, label: f.label, kind: f.kind,
        value: fixed ? parseAmount(f.value) ?? '' : f.value,
        currency: fixed ? f.currency : undefined,
        appliesTo: f.appliesTo,
        minAmount: f.minAmount ? parseAmount(f.minAmount) ?? '' : 0,
        maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : null,
        perUserLimit: Number(f.perUserLimit) || 1,
        endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null
      } });
      setF({ ...f, code: '', label: '' });
    }, 'Promo code created.');
    setBusy(false);
  }

  const toggleAppliesTo = (k: string) => setF({ ...f, appliesTo: f.appliesTo.includes(k) ? f.appliesTo.filter((x) => x !== k) : [...f.appliesTo, k] });

  return (
    <div className="stack-lg">
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="card-box stack" aria-labelledby="new-promo">
        <h2 id="new-promo" style={{ fontSize: 18 }}>New promo code</h2>
        <form className="stack" onSubmit={create}>
          <div className="two-col" style={{ gap: 8 }}>
            <label className="field">Code<input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="DIWALI25" maxLength={32} required /></label>
            <label className="field">Name customers see<input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Diwali offer" maxLength={80} required /></label>
            <label className="field">Type<select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, value: e.target.value === 'percent' ? '10' : '' })}><option value="percent">Percentage off</option><option value="fixed">Fixed amount off</option></select></label>
            {f.kind === 'percent'
              ? <label className="field">Percentage (1–100)<input className="input" type="number" min={1} max={100} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></label>
              : <div className="row" style={{ gap: 8 }}>
                  <label className="field">Currency<select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label className="field">Amount off<input className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="5.00" required /></label>
                </div>}
            <label className="field">Minimum purchase (optional)<input className="input" inputMode="decimal" value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} placeholder="0" /></label>
            <label className="field">Total uses (blank = unlimited)<input className="input" type="number" min={1} value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })} /></label>
            <label className="field">Uses per customer<input className="input" type="number" min={1} max={100} value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} /></label>
            <label className="field">Ends on (optional)<input className="input" type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field" style={{ marginBottom: 6 }}>Applies to</legend>
            <div className="row-wrap">{PURPOSES.map(([k, label]) => (
              <label key={k} className="chip"><input type="checkbox" checked={f.appliesTo.includes(k)} onChange={() => toggleAppliesTo(k)} /> {label}</label>
            ))}</div>
          </fieldset>
          <p className="muted small" style={{ margin: 0 }}>Subscriptions (Family, Business) aren’t included: discounts apply to shop, printed-card and gift-card purchases.</p>
          <button className="btn" disabled={busy || f.appliesTo.length === 0}>{busy ? 'Saving…' : 'Create code'}</button>
        </form>
      </section>

      <section className="card-box stack" aria-labelledby="promos">
        <h2 id="promos" style={{ fontSize: 18 }}>Promo codes</h2>
        {promos.length === 0 ? <p className="muted small">No codes yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 14 }}>
              <thead><tr><th scope="col">Code</th><th scope="col">Offer</th><th scope="col">Applies to</th><th scope="col">Used</th><th scope="col">Saved</th><th scope="col">Status</th></tr></thead>
              <tbody>{promos.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.code}</b><br /><span className="muted small">{p.label}{p.partner ? ` · partner: ${p.partner}` : ''}</span></td>
                  <td>{offer(p)}{p.minAmount ? <span className="muted small"><br />min {formatMoney(p.minAmount, p.currency ?? 'INR')}</span> : null}</td>
                  <td className="small">{p.appliesTo.split(',').join(', ')}</td>
                  <td>{p.used}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}</td>
                  <td>{formatMoney(p.saved, p.currency ?? 'INR')}</td>
                  <td>
                    {p.partner
                      ? <span className="muted small">Set by partner approval</span>
                      : <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/promos/${p.id}`, { method: 'PUT', body: { active: !p.active } }), p.active ? 'Code paused.' : 'Code resumed.')}>{p.active ? 'Pause' : 'Resume'}</button>}
                    <span className={`badge ${p.active ? 'badge-green' : ''}`} style={{ marginInlineStart: 6 }}>{p.active ? 'On' : 'Off'}</span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-box stack" aria-labelledby="partners">
        <h2 id="partners" style={{ fontSize: 18 }}>Partner programme</h2>
        {affiliates.length === 0 ? <p className="muted small">No applications yet.</p> : (
          <ul className="list" style={{ gap: 12 }}>{affiliates.map((a) => (
            <li key={a.id} className="stack" style={{ borderTop: '1px solid var(--line, #e5e5e5)', paddingTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span><b>{a.name}</b> <span className="muted small">{a.email} · code {a.code}</span></span>
                <span className="badge">{a.status}</span>
              </div>
              <p className="small" style={{ margin: 0 }}>Commission {a.commissionPercent}% · Waiting {money(a.pending)} · Paid {money(a.paid)}</p>
              <div className="row-wrap" style={{ gap: 8 }}>
                {a.status !== 'approved' && <button className="btn btn-sm" onClick={() => run(() => api(`/api/admin/affiliates/${a.id}`, { method: 'PUT', body: { status: 'approved' } }), 'Partner approved.')}>Approve</button>}
                {a.status === 'approved' && <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/affiliates/${a.id}`, { method: 'PUT', body: { status: 'paused' } }), 'Partner paused.')}>Pause</button>}
                {a.status !== 'rejected' && <button className="btn btn-danger btn-sm" onClick={() => run(() => api(`/api/admin/affiliates/${a.id}`, { method: 'PUT', body: { status: 'rejected' } }), 'Application declined.')}>Decline</button>}
                <label className="row" style={{ gap: 6 }}><span className="small">Commission %</span>
                  <input className="input" type="number" min={0} max={50} style={{ width: 80 }} value={pct[a.id] ?? a.commissionPercent} onChange={(e) => setPct({ ...pct, [a.id]: e.target.value })} aria-label={`Commission for ${a.name}`} />
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/affiliates/${a.id}`, { method: 'PUT', body: { status: a.status === 'pending' ? 'approved' : a.status, commissionPercent: Number(pct[a.id] ?? a.commissionPercent) } }), 'Commission saved.')}>Save %</button>
              </div>
              {Object.keys(a.pending).length > 0 && (
                <div className="row-wrap" style={{ gap: 8 }}>
                  <input className="input" placeholder="Payment reference (e.g. bank transfer ID)" value={pay[a.id] ?? ''} onChange={(e) => setPay({ ...pay, [a.id]: e.target.value })} aria-label={`Payment reference for ${a.name}`} style={{ flex: '1 1 260px' }} />
                  <button className="btn btn-sm" disabled={!(pay[a.id] ?? '').trim()} onClick={() => run(() => api(`/api/admin/affiliates/${a.id}/pay`, { body: { reference: pay[a.id] } }), 'Marked as paid.')}>Mark {money(a.pending)} paid</button>
                </div>
              )}
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
