'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';

type Sub = { id: string; planId: string; provider: string; status: string; amount: number; currency: string; interval: string; currentPeriodEnd: string | null; note: string | null };

export function PlanGrant({ userId, current, subs }: { userId: string; current: string; subs: Sub[] }) {
  const router = useRouter();
  const [v, setV] = useState({ planId: 'family', until: '', note: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' }); } };
  return (
    <div className="stack">
      <p className="small">Current plan: <b>{current}</b></p>
      {subs.length > 0 && (
        <ul className="list small" style={{ gap: 4 }}>
          {subs.map((s) => (
            <li key={s.id} className="row" style={{ gap: 6 }}>
              <span className="grow">{s.planId} · {s.provider} · <b>{s.status}</b>{s.amount ? ` · ${(s.amount / 100).toFixed(2)} ${s.currency}/${s.interval}` : ''}{s.currentPeriodEnd ? ` · until ${s.currentPeriodEnd.slice(0, 10)}` : ''}{s.note ? ` · ${s.note}` : ''}</span>
              {s.provider === 'manual' && s.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/users/${userId}/plan`, { method: 'DELETE', body: { subscriptionId: s.id } }), 'Grant ended')}>End</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="stack" aria-label="Give a plan" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/admin/users/${userId}/plan`, { body: v }), 'Plan given'); }}>
        <div className="two-col" style={{ gap: 8 }}>
          <label className="field">Plan<select className="select" aria-label="Plan to give" value={v.planId} onChange={(e) => setV({ ...v, planId: e.target.value })}><option value="family">Family</option><option value="business">Business</option></select></label>
          <label className="field">Until<input className="input" type="date" aria-label="Until" value={v.until} onChange={(e) => setV({ ...v, until: e.target.value })} /></label>
        </div>
        <label className="field">Note (audit log)<input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="e.g. launch partner, refund goodwill" /></label>
        <button className="btn btn-ghost">Give plan for free</button>
      </form>
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
