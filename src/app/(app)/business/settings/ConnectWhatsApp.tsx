'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/components/api';
import { useT } from '@/components/I18n';

export function ConnectWhatsApp({ connected }: { connected: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [v, setV] = useState({ phoneNumberId: '', businessAccountId: '', accessToken: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key); setMsg(null); setFields({});
    try { setMsg({ ok: true, text: await fn() }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }); if (e instanceof ApiError && e.fields) setFields(e.fields); }
    setBusy(null);
  }
  if (connected) {
    return (
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('sync', async () => { const r = await api<{ templates: unknown[] }>('/api/business/templates', { method: 'POST' }); return `${r.templates.length} templates loaded from WhatsApp`; })}>{busy === 'sync' ? t("Refreshing…") : t("Refresh templates")}</button>
          <button className="btn btn-danger" disabled={!!busy} onClick={() => run('off', async () => { await api('/api/business/whatsapp', { method: 'DELETE' }); return 'Disconnected'; })}>{t("Disconnect")}</button>
        </div>
        {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </div>
    );
  }
  return (
    <form className="stack" aria-label={t("Connect WhatsApp")} noValidate onSubmit={(e) => { e.preventDefault(); run('connect', async () => { await api('/api/business/whatsapp', { body: v }); return 'Connected'; }); }}>
      <label className="field">{t("Phone number ID")}<input className="input" inputMode="numeric" value={v.phoneNumberId} onChange={(e) => setV({ ...v, phoneNumberId: e.target.value })} aria-invalid={!!fields.phoneNumberId} />{fields.phoneNumberId && <span className="error">{fields.phoneNumberId}</span>}</label>
      <label className="field">{t("WhatsApp Business Account ID")}<input className="input" inputMode="numeric" value={v.businessAccountId} onChange={(e) => setV({ ...v, businessAccountId: e.target.value })} aria-invalid={!!fields.businessAccountId} />{fields.businessAccountId && <span className="error">{fields.businessAccountId}</span>}</label>
      <label className="field">{t("Permanent access token")}<input className="input" type="password" autoComplete="off" value={v.accessToken} onChange={(e) => setV({ ...v, accessToken: e.target.value })} aria-invalid={!!fields.accessToken} />{fields.accessToken && <span className="error">{fields.accessToken}</span>}</label>
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn" disabled={!!busy}>{busy ? t("Checking with WhatsApp…") : t("Connect WhatsApp")}</button>
    </form>
  );
}
