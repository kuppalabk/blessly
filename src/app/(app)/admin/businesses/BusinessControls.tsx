'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';

export function BusinessControls({ id, name, quota, paused }: { id: string; name: string; quota: number | null; paused: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(quota === null ? '' : String(quota));
  const [reason, setReason] = useState('');
  const [pausing, setPausing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setPausing(false); setReason(''); router.refresh(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' }); }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/admin/businesses/${id}`, { method: 'PATCH', body: { quota: q === '' ? null : Number(q) } }), 'Allowance saved'); }}>
        <label className="grow"><span className="sr-only">Monthly allowance for {name}</span><input className="input" style={{ minHeight: 40 }} inputMode="numeric" placeholder="From plan" aria-label={`Monthly allowance for ${name}`} value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} /></label>
        <button className="btn btn-ghost btn-sm">Save</button>
      </form>
      {paused
        ? <button className="btn btn-sm" onClick={() => run(() => api(`/api/admin/businesses/${id}/pause`, { method: 'DELETE' }), 'Sending resumed')}>Resume sending</button>
        : pausing ? (
          <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/admin/businesses/${id}/pause`, { body: { reason } }), 'Paused'); }}>
            <input className="input" style={{ minHeight: 40 }} aria-label={`Reason for pausing ${name}`} placeholder="Reason (the owner sees it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            <div className="row" style={{ gap: 6 }}><button className="btn btn-danger btn-sm grow">Pause</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPausing(false)}>Cancel</button></div>
          </form>
        ) : <button className="btn btn-ghost btn-sm" onClick={() => setPausing(true)}>Pause sending…</button>}
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
