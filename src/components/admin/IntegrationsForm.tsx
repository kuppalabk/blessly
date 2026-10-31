'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import type { SettingStatus } from '@/server/settings';

const GROUP_TITLES: Record<string, string> = {
  email: 'Email (Resend)', ai: 'AI wishes (Anthropic)', stripe: 'Payments: Stripe', razorpay: 'Payments: Razorpay (India)',
  whatsapp: 'WhatsApp (Meta)', push: 'Push notifications', storage: 'Photo storage (S3-compatible)', sms: 'SMS sign-in (Twilio)',
  google: 'Sign in with Google', apple: 'Sign in with Apple', legal: 'Company and legal', features: 'Feature switches',
  android: 'Android app links', security: 'Security', 'sign-in': 'Sign-in',
};
const TESTABLE = new Set(['email', 'ai', 'stripe', 'razorpay', 'sms', 'google', 'push', 'apple', 'storage']);
const SOURCE_LABEL = { admin: 'Set here', env: 'From server environment', unset: 'Not set' } as const;

export function IntegrationsForm({ settings }: { settings: SettingStatus[] }) {
  const router = useRouter();
  const groups = [...new Set(settings.map((s) => s.group))];
  return (
    <div className="stack-lg">
      {groups.map((g) => (
        <section key={g} className="card-box stack" aria-labelledby={`g-${g}`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 id={`g-${g}`} style={{ fontSize: 18 }}>{GROUP_TITLES[g] ?? g}</h2>
            {TESTABLE.has(g) && <GroupTest group={g} />}
          </div>
          {settings.filter((s) => s.group === g).map((s) => (
            <SettingRow key={s.key} s={s} onChanged={() => router.refresh()} />
          ))}
        </section>
      ))}
    </div>
  );
}

function GroupTest({ group }: { group: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function run() {
    setBusy(true); setResult(null);
    try {
      setResult(await api<{ ok: boolean; message: string }>('/api/admin/settings/test', { body: { group } }));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy}>{busy ? 'Testing…' : 'Test connection'}</button>
      {result && <span role="status" className="small" style={{  }}>{result.message}</span>}
    </span>
  );
}

function SettingRow({ s, onChanged }: { s: SettingStatus; onChanged: () => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft.trim()) { setError('Enter a value first'); return; }
    setBusy(true); setError(null);
    try {
      await api(`/api/admin/settings/${encodeURIComponent(s.key)}`, { method: 'PUT', body: { value: draft } });
      setDraft('');
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(`Clear ${s.label}?`)) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/admin/settings/${encodeURIComponent(s.key)}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear');
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20_000) { setError('That file is too large'); return; }
    setDraft(await file.text());
  }

  const id = `s-${s.key}`;
  return (
    <div data-testid={`setting-${s.key}`} className="stack" style={{ borderTop: '1px solid var(--line, #e5e5e5)', paddingTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor={id}><b>{s.label}</b> <span className="small muted">({s.key})</span></label>
        <span className="badge">{SOURCE_LABEL[s.source]}</span>
      </div>
      {s.help && <p className="small muted">{s.help}</p>}
      {s.preview !== null && <p className="small">Current: <code>{s.preview}</code></p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {s.file ? (
          <>
            <textarea id={id} className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the key contents, or upload the file" style={{ flex: '1 1 260px', fontFamily: 'monospace' }} autoComplete="off" spellCheck={false} />
            <input type="file" accept=".p8,.pem,.txt" aria-label={`Upload ${s.label}`} onChange={(e) => loadFile(e.target.files?.[0])} />
          </>
        ) : (
          <input id={id} className="input" type={s.secret ? 'password' : 'text'} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={s.secret ? 'Paste a new value' : 'Enter a value'} autoComplete="off" spellCheck={false} style={{ flex: '1 1 260px' }} />
        )}
        <button type="button" className="btn" onClick={save} disabled={busy}>Save</button>
        {s.source === 'admin' && <button type="button" className="btn btn-ghost" onClick={clear} disabled={busy}>Clear</button>}
      </div>
      {error && <p role="alert" className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
