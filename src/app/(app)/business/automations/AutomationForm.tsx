'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

export type TemplateOption = { id: string; name: string; language: string; body: string; usable: boolean; status: string };
type Auto = { kind: string; enabled: boolean; channel: string; templateId: string | null; emailSubject: string; emailBody: string; sendHour: number };

const TITLE: Record<string, string> = { birthday: msg('Birthday wishes'), anniversary: msg('Anniversary wishes') };

export function preview(text: string, business: string) {
  return text.replace(/\{\{\s*1\s*\}\}/g, 'Nisha').replace(/\{\{\s*2\s*\}\}/g, business).replaceAll('{name}', 'Nisha').replaceAll('{business}', business);
}

export function ChannelFields({ v, set, templates, waConnected, business }: { v: { channel: string; templateId: string | null; emailSubject: string; emailBody: string }; set: (p: Partial<Auto>) => void; templates: TemplateOption[]; waConnected: boolean; business: string }) {
  const { t: tr } = useT();
  const t = templates.find((x) => x.id === v.templateId);
  return (
    <>
      <label className="field">{tr("Send by")}<select className="select" aria-label={tr("Send by")} value={v.channel} onChange={(e) => set({ channel: e.target.value })}>
          <option value="both">{tr("WhatsApp, or email if no WhatsApp")}</option>
          <option value="whatsapp">{tr("WhatsApp only")}</option>
          <option value="email">{tr("Email only")}</option>
        </select>
      </label>
      {v.channel !== 'email' && (
        <div className="stack" style={{ gap: 8 }}>
          {!waConnected ? <p className="notice small">{tr("Connect WhatsApp in Settings to send WhatsApp messages. Until then, customers with an email get the email.")}</p> : (
            <label className="field">{tr("WhatsApp template (approved by Meta)")}<select className="select" aria-label={tr("WhatsApp template")} value={v.templateId ?? ''} onChange={(e) => set({ templateId: e.target.value || null })}>
                <option value="">{tr("Choose a template")}</option>
                {templates.map((x) => <option key={x.id} value={x.id} disabled={!x.usable}>{x.name} ({x.language}){x.usable ? '' : x.status !== 'APPROVED' ? ` — ${x.status.toLowerCase()}` : tr(" — too many variables")}</option>)}
              </select>
            </label>
          )}
          {t && <div className="stack" style={{ gap: 4 }}><span className="muted small">{tr("Preview")}</span><p className="wa-bubble">{preview(t.body, business)}</p></div>}
        </div>
      )}
      {v.channel !== 'whatsapp' && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field">{tr("Email subject")}<input className="input" aria-label={tr("Email subject")} value={v.emailSubject} onChange={(e) => set({ emailSubject: e.target.value })} maxLength={150} /></label>
          <label className="field">{tr("Email message")}<textarea className="textarea" aria-label={tr("Email message")} value={v.emailBody} onChange={(e) => set({ emailBody: e.target.value })} maxLength={2000} style={{ minHeight: 90 }} /></label>
          <p className="muted small">{tr("Use")}{' '}{tr("{name}")}{' '}{tr("for the customer’s first name and")}{' '}{tr("{business}")}{' '}{tr("for your business name. An unsubscribe link is added automatically.")}</p>
        </div>
      )}
    </>
  );
}

export function AutomationForm({ initial, templates, waConnected, business }: { initial: Auto; templates: TemplateOption[]; waConnected: boolean; business: string }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Auto>) => { setV({ ...v, ...p }); setMsg(null); };
  return (
    <form className="card-box stack" aria-label={tr(TITLE[v.kind])} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try { await api(`/api/business/automations/${v.kind}`, { method: 'PUT', body: v }); setMsg({ ok: true, text: tr('Saved') }); router.refresh(); }
      catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : tr('Could not save') }); }
      setBusy(false);
    }}>
      <div className="row between">
        <div><h2 style={{ fontSize: 19 }}>{tr(TITLE[v.kind])}</h2><p className="muted small">{tr("Sent on the customer’s {kind}, once a year.", { kind: v.kind })}</p></div>
        <button type="button" role="switch" className="switch" aria-checked={v.enabled} aria-label={tr("{v} on", { v: tr(TITLE[v.kind]) })} onClick={() => set({ enabled: !v.enabled })} />
      </div>
      <ChannelFields v={v} set={set} templates={templates} waConnected={waConnected} business={business} />
      <label className="field">{tr("Send at")}<select className="select" aria-label={tr("Send at")} value={v.sendHour} onChange={(e) => set({ sendHour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </label>
      {msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn" disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
    </form>
  );
}
