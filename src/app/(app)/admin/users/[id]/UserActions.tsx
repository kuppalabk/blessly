'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';

export function UserActions({ id, email, suspended, protectedAccount }: { id: string; email: string; suspended: boolean; protectedAccount: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'suspend' | 'delete' | 'view'>('none');
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<string>, after?: () => void) {
    setBusy(true); setMsg(null);
    try { const t = await fn(); setMsg({ ok: true, text: t }); setMode('none'); setReason(''); after ? after() : router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }); }
    setBusy(false);
  }
  if (protectedAccount) return <p className="muted small">Admin accounts and your own account can only be changed from the command line.</p>;
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {suspended
          ? <button className="btn" disabled={busy} onClick={() => run(async () => { await api(`/api/admin/users/${id}/suspend`, { method: 'DELETE' }); return 'Account restored'; })}>Restore account</button>
          : <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('suspend')}>Suspend…</button>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => { const r = await api<{ ended: number }>(`/api/admin/users/${id}/logout`, { method: 'POST' }); return `Logged out of ${r.ended} device${r.ended === 1 ? '' : 's'}`; })}>Log out everywhere</button>
        {!suspended && <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('view')}>View as user…</button>}
        <button className="btn btn-danger" disabled={busy} onClick={() => setMode('delete')}>Delete…</button>
      </div>
      {mode === 'suspend' && (
        <form className="card-box stack" aria-label="Suspend account" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/api/admin/users/${id}/suspend`, { body: { reason } }); return 'Account suspended'; }); }}>
          <p className="small">They’ll be logged out and can’t log in. Scheduled emails are cancelled and any business they own is paused.</p>
          <label className="field">Reason (kept in the audit log)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          <div className="row"><button className="btn btn-danger grow" disabled={busy}>Suspend account</button><button type="button" className="btn btn-ghost grow" onClick={() => setMode('none')}>Cancel</button></div>
        </form>
      )}
      {mode === 'view' && (
        <form className="card-box stack" aria-label="View as user" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/api/admin/users/${id}/view-as`, { body: { reason } }); return 'Opening…'; }, () => window.location.assign('/home')); }}>
          <p className="small">See the app exactly as they do, to help with a support request. It’s read-only, ends after 30 minutes, is recorded in the audit log, and they’re told that support viewed their account.</p>
          <label className="field">Reason (they’ll see it)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. your reminders aren’t arriving" /></label>
          <div className="row"><button className="btn grow" disabled={busy}>Start support view</button><button type="button" className="btn btn-ghost grow" onClick={() => setMode('none')}>Cancel</button></div>
        </form>
      )}
      {mode === 'delete' && (
        <form className="card-box stack" aria-label="Delete account" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/api/admin/users/${id}`, { method: 'DELETE', body: { confirmEmail, reason } }); return 'Deleted'; }, () => { router.push('/admin/users'); router.refresh(); }); }}>
          <p className="small"><b>This permanently deletes the account and everything they own</b> — people, wishes, their business and its customers. Family circles they own pass to the next member. It can’t be undone.</p>
          <label className="field">Reason (e.g. “deletion request by email, ticket 123”)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          <label className="field">Type {email} to confirm<input className="input" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" /></label>
          <div className="row"><button className="btn btn-danger grow" disabled={busy || confirmEmail.trim().toLowerCase() !== email}>Delete permanently</button><button type="button" className="btn btn-ghost grow" onClick={() => setMode('none')}>Cancel</button></div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'notice' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}
