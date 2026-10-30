'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { ChannelFields, type TemplateOption } from '../automations/AutomationForm';
import { useT } from '@/components/I18n';

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CampaignForm({ templates, waConnected, business }: { templates: TemplateOption[]; waConnected: boolean; business: string }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [v, setV] = useState({ name: '', channel: waConnected ? 'both' : 'email', templateId: null as string | null, emailSubject: 'Season’s greetings, {name}!', emailBody: 'Warm wishes from all of us at {business}.', tag: '', sendAt: '' });
  const [audience, setAudience] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV((x) => (x.sendAt ? x : { ...x, sendAt: localInput(new Date(Date.now() + 3600000)) })); }, []);
  useEffect(() => {
    const t = setTimeout(() => { api<{ audience: number }>(`/api/business/campaigns?audience=${encodeURIComponent(v.tag)}`).then((r) => setAudience(r.audience)).catch(() => setAudience(null)); }, 300);
    return () => clearTimeout(t);
  }, [v.tag]);
  const set = (p: Partial<typeof v>) => { setV({ ...v, ...p }); setError(null); };
  return (
    <form className="card-box stack" aria-label={tr("New campaign")} noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await api('/api/business/campaigns', { body: { ...v, sendAt: new Date(v.sendAt).toISOString() } }); setV({ ...v, name: '' }); router.refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : tr("Could not schedule")); }
      setBusy(false);
    }}>
      <h2 style={{ fontSize: 19 }}>{tr("New campaign")}</h2>
      <label className="field">{tr("Campaign name")}<input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder={tr("e.g. Diwali greetings 2026")} maxLength={80} /></label>
      <div className="two-col" style={{ gap: 12 }}>
        <label className="field">{tr("Send on")}<input className="input" type="datetime-local" aria-label={tr("Send on")} value={v.sendAt} onChange={(e) => set({ sendAt: e.target.value })} /></label>
        <label className="field">{tr("Only customers tagged (optional)")}<input className="input" aria-label={tr("Only customers tagged")} value={v.tag} onChange={(e) => set({ tag: e.target.value })} placeholder={tr("e.g. vip")} /></label>
      </div>
      <p className="small" role="status">{audience === null ? ' ' : `${audience.toLocaleString()} customer${audience === 1 ? '' : 's'} who agreed to messages`}</p>
      <ChannelFields v={v} set={(p) => set(p as Partial<typeof v>)} templates={templates} waConnected={waConnected} business={business} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? tr("Scheduling…") : tr("Schedule campaign")}</button>
    </form>
  );
}

export function CancelCampaign({ id }: { id: string }) {
  const { t: tr } = useT();
  const router = useRouter();
  return <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/business/campaigns/${id}`, { method: 'DELETE' }).catch(() => {}); router.refresh(); }}>{tr("Cancel")}</button>;
}
