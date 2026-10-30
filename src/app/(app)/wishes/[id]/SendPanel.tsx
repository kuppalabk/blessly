'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { Icon, type IconName } from '@/components/Icon';
import { facebookLink, linkedinLink, mailtoLink, shareMessage, smsLink, telegramLink, whatsappLink, xLink } from '@/lib/send-links';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

type Send = { id: string; channel: string; recipient: string; sendAt: string; status: string };
type Props = { wishId: string; text: string; recipientName: string; pageUrl: string | null; phone: string | null; email: string | null; sends: Send[]; timezone: string };

const CHANNEL_LABEL: Record<string, string> = { email: msg('Email (sent automatically)'), whatsapp: msg('WhatsApp (we remind you to send)'), telegram: msg('Telegram (we remind you to send)'), sms: msg('SMS (we remind you to send)') };

function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600000);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export function SendPanel(p: Props) {
  const { t } = useT();
  const router = useRouter();
  const message = shareMessage(p.text, p.pageUrl);
  const [copied, setCopied] = useState<string | null>(null);
  const [channel, setChannel] = useState(p.email ? 'email' : 'whatsapp');
  const [recipient, setRecipient] = useState(p.email ?? p.phone ?? '');
  const [when, setWhen] = useState(defaultWhen);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(what: string, value: string) {
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard blocked: user can select the text */ }
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(`/api/wishes/${p.wishId}/sends`, { body: { channel, recipient, sendAt: new Date(when).toISOString() } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not schedule"));
    } finally {
      setBusy(false);
    }
  }

  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  const links: { label: string; sub: string; href: string; icon: IconName }[] = [
    { label: 'WhatsApp', sub: p.phone ? t('To {name}', { name: p.recipientName }) : t('Choose a chat'), href: whatsappLink(message, p.phone), icon: 'whatsapp' },
    { label: 'Telegram', sub: t('Choose a chat'), href: telegramLink(p.text, p.pageUrl ?? ''), icon: 'telegram' },
    { label: 'SMS', sub: p.phone ? t('To {name}', { name: p.recipientName }) : t('Choose a contact'), href: smsLink(message, p.phone), icon: 'sms' },
    { label: t('Email'), sub: p.email ? t('To {name}', { name: p.email }) : t('Choose an address'), href: mailtoLink(message, t('A wish for you, {name}', { name: p.recipientName }), p.email), icon: 'mail' }
  ];

  return (
    <div className="stack-lg">
      <section className="stack" aria-labelledby="now">
        <h2 id="now">{t("Send now")}</h2>
        <p className="muted small">{t("Opens your own app with the message ready. You tap send, so it comes from you.")}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }} data-channel={l.label.toLowerCase()}>
              <Icon name={l.icon} /><b>{l.label}</b><span className="muted small">{l.sub}</span>
            </a>
          ))}
        </div>
        <div className="row-wrap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('message', message)}>{copied === 'message' ? t("Copied") : t("Copy message")}</button>
          {p.pageUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('link', p.pageUrl!)}>{copied === 'link' ? t("Copied") : t("Copy wish page link")}</button>}
          {p.pageUrl && <a className="btn btn-ghost btn-sm" href={p.pageUrl} target="_blank" rel="noopener noreferrer">{t("Preview wish page")}</a>}
        </div>
        {p.pageUrl && (
          <div className="stack" style={{ gap: 8 }} aria-label={t("Share on social media")} role="group">
            <p className="small"><b>{t("Post on social media")}</b> <span className="muted">{t("— shares the wish page with its card preview")}</span></p>
            <div className="row-wrap">
              <a className="btn btn-ghost btn-sm" data-channel="facebook" href={facebookLink(p.pageUrl)} target="_blank" rel="noopener noreferrer">{t("Facebook")}</a>
              <a className="btn btn-ghost btn-sm" data-channel="linkedin" href={linkedinLink(p.pageUrl)} target="_blank" rel="noopener noreferrer">{t("LinkedIn")}</a>
              <a className="btn btn-ghost btn-sm" data-channel="x" href={xLink(p.text, p.pageUrl)} target="_blank" rel="noopener noreferrer">X</a>
              {canShare && <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: t('A wish for {name}', { name: p.recipientName }), text: p.text, url: p.pageUrl! }).catch(() => undefined)}>{t("More apps (Instagram…)")}</button>}
            </div>
            <p className="muted small">{t("Instagram doesn’t accept links from websites. On your phone use “More apps”, or copy the message and paste it into an Instagram chat.")}</p>
          </div>
        )}
        {p.pageUrl && <p className="notice small"><Icon name="link" size={16} /> {' '}{t("Friends and family can add their own messages on the wish page:")}{' '}<span style={{ wordBreak: 'break-all' }} data-testid="page-url">{p.pageUrl}</span></p>}
      </section>

      <section className="stack" aria-labelledby="later">
        <h2 id="later">{t("Or schedule")}</h2>
        <form onSubmit={schedule} className="stack card-box">
          <label className="field">{t("How")}<select className="select" aria-label={t("How")} value={channel} onChange={(e) => { setChannel(e.target.value); setRecipient(e.target.value === 'email' ? p.email ?? '' : p.phone ?? ''); }}>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select>
          </label>
          {channel !== 'telegram' && (
            <label className="field">{channel === 'email' ? t("Their email") : t("Their mobile")}
              <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} type={channel === 'email' ? 'email' : 'tel'} />
            </label>
          )}
          <label className="field">{t("When (your device's time)")}<input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? t("Scheduling…") : t("Schedule")}</button>
        </form>
        {p.sends.length > 0 && (
          <ul className="list" aria-label={t("Scheduled")}>
            {p.sends.map((s) => (
              <li key={s.id} className="item">
                <Icon name="clock" />
                <span className="grow"><b style={{ textTransform: 'capitalize' }}>{s.channel}</b> · {new Date(s.sendAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}<br /><span className="muted small">{s.recipient}</span></span>
                {s.status === 'scheduled' ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/sends/${s.id}`, { method: 'DELETE' }); router.refresh(); }}>{t("Cancel")}</button>
                ) : <span className={`badge ${s.status === 'sent' ? 'badge-green' : ''}`}>{s.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
