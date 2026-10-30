'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { CelebrationForm, type CelebrationInput } from './CelebrationForm';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

export type HostGuest = { id: string; name: string; email: string | null; phone: string | null; status: string; partySize: number; diet: string | null; access: string | null; note: string | null; invitedAt: string | null; token: string; selfAdded: boolean };
export type HostPost = { id: string; name: string; message: string; approved: boolean; kind: string; createdAt: string; media: { url: string; kind: 'image' | 'video' } | null };
type Summary = { invited: number; yes: number; no: number; maybe: number; waiting: number; headcount: number; diets: { name: string; diet: string }[]; access: { name: string; access: string }[] };

type Props = {
  id: string; title: string; slug: string; appUrl: string; whenText: string; past: boolean; cancelled: boolean; visibility: string;
  guests: HostGuest[]; posts: HostPost[]; updates: { id: string; body: string; createdAt: string; emailed: number }[]; summary: Summary;
  form: CelebrationInput; wishlists: { id: string; title: string }[]; money?: boolean;
};

const STATUS: Record<string, string> = { invited: msg('No answer yet'), yes: msg('Coming'), no: msg('Can’t come'), maybe: msg('Maybe') };
const TABS = [msg('Guests'), msg('Messages'), msg('Updates'), msg('Details')] as const;

/** Splits pasted lines like "Meena, meena@example.com" or "Gran +44 7700 900123" into guests. */
export function parseGuestLines(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((line) => {
    const email = line.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/)?.[0] ?? null;
    const phone = line.replace(email ?? '', '').match(/\+?\d[\d ()-]{5,18}\d/)?.[0]?.trim() ?? null;
    const name = line.replace(email ?? '', '').replace(phone ?? '', '').replace(/[<>,;]+/g, ' ').replace(/\s+/g, ' ').trim() || (email ? email.split('@')[0] : 'Guest');
    return { name: name.slice(0, 80), email, phone };
  });
}

export function HostDashboard(p: Props) {
  const { t: tr, tp } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Guests');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [update, setUpdate] = useState('');
  const [thanks, setThanks] = useState(tr('Thank you so much for being part of {title}. It meant a lot!', { title: p.title }));
  const [cancelNote, setCancelNote] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${p.appUrl}/c/${p.slug}`;
  const pending = p.posts.filter((x) => !x.approved).length;
  const uninvited = p.guests.filter((g) => g.email && !g.invitedAt).length;

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setError(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : tr("Something went wrong")); } finally { setBusy(null); }
  }
  const wa = (g: HostGuest) => `https://wa.me/${(g.phone ?? '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(tr('Hi {name}! You’re invited: {title} — {when}. Details and RSVP: {link}', { name: g.name, title: p.title, when: p.whenText, link: `${p.appUrl}/c/${p.slug}?g=${g.token}` }))}`;

  return (
    <div className="stack-lg">
      <section className="card-box stack" aria-label={tr("Summary")}>
        <div className="stats">
          <div className="stat"><b>{p.summary.headcount}</b><span>{tr("coming")}</span></div>
          <div className="stat"><b>{p.summary.maybe}</b><span>{tr("maybe")}</span></div>
          <div className="stat"><b>{p.summary.no}</b><span>{tr("can’t come")}</span></div>
          <div className="stat"><b>{p.summary.waiting}</b><span>{tr("no answer")}</span></div>
        </div>
        <div className="link-box"><span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="celebration-link">{link}</span>
          <button type="button" className="btn btn-sm" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? tr("Copied") : tr("Copy")}</button>
        </div>
        <div className="row-wrap">
          <a className="btn btn-ghost btn-sm" href={`/c/${p.slug}`} target="_blank" rel="noopener noreferrer">{tr("View page")}</a>
          {p.visibility !== 'invite' && <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${p.title} — ${p.whenText}. Details and RSVP: ${link}`)}`} target="_blank" rel="noopener noreferrer">{tr("Share on WhatsApp")}</a>}
          <a className="btn btn-ghost btn-sm" href={`/c/${p.slug}/calendar.ics`}>{tr("Add to my calendar")}</a>
          {p.money && <a className="btn btn-ghost btn-sm" href={`/pots?celebration=${p.id}&title=${encodeURIComponent(`Group gift — ${p.title}`)}`}>{tr("💝 Add a group gift")}</a>}
        </div>
        {p.visibility === 'invite' && <p className="muted small" style={{ margin: 0 }}>{tr("Invited guests only — share each guest’s personal link (Guests tab), not this one.")}</p>}
        {p.cancelled && <p className="notice">{tr("This celebration is cancelled.")}</p>}
      </section>

      <div className="biz-tabs" role="tablist" aria-label={tr("Manage")}>
        {TABS.map((t) => <button key={t} type="button" role="tab" className="biz-tab" aria-selected={tab === t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{tr(t)}{t === 'Messages' && pending ? tr(" ({pending} to approve)", { pending }) : t === 'Guests' ? ` (${p.guests.length})` : ''}</button>)}
      </div>
      {msg && <p className="notice" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {tab === 'Guests' && (
        <section className="stack" aria-label={tr("Guests")}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); const guests = parseGuestLines(paste); if (!guests.length) return; void run('add', async () => { await api(`/api/celebrations/${p.id}/guests`, { body: { guests } }); setPaste(''); return tp(guests.length, 'Added {n} guest', 'Added {n} guests'); }); }}>
            <label className="field">{tr("Add guests — one per line: name, then email and/or phone")}<textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={tr("Meena Shah, meena@example.com\nTom +44 7700 900123")} style={{ minHeight: 90 }} />
            </label>
            <div className="row-wrap">
              <button type="submit" className="btn btn-sm" disabled={busy === 'add' || !paste.trim()}>{tr("Add guests")}</button>
              <button type="button" className="btn btn-dark btn-sm" disabled={!!busy || !uninvited} onClick={() => run('invite', async () => { const r = await api<{ emailed: number }>(`/api/celebrations/${p.id}/invite`, { body: {} }); return tp(r.emailed, 'Invitations emailed to {n} guest', 'Invitations emailed to {n} guests'); })}>{busy === 'invite' ? tr("Sending…") : `Email invitations${uninvited ? ` (${uninvited})` : ''}`}</button>
              <a className="btn btn-ghost btn-sm" href={`/api/celebrations/${p.id}/guests-csv`}>{tr("Download guest list")}</a>
            </div>
          </form>
          {(p.summary.diets.length > 0 || p.summary.access.length > 0) && (
            <div className="card-box stack" style={{ gap: 6 }}>
              <b>{tr("Needs to plan for")}</b>
              {p.summary.diets.map((d) => <span key={'d' + d.name} className="small">🍽️ {d.name}: {d.diet}</span>)}
              {p.summary.access.map((d) => <span key={'a' + d.name} className="small">♿ {d.name}: {d.access}</span>)}
            </div>
          )}
          {p.guests.length === 0 ? <p className="muted">{tr("No guests yet. Add them above")}{p.visibility !== 'invite' ? tr(", or share the link — people who reply are added automatically") : ''}.</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{tr("Guest")}</th><th>{tr("Answer")}</th><th>{tr("Invite")}</th><th><span className="sr-only">{tr("Actions")}</span></th></tr></thead>
              <tbody>
                {p.guests.map((g) => (
                  <tr key={g.id}>
                    <td><b>{g.name}</b>{g.partySize > 1 && g.status === 'yes' ? ` +${g.partySize - 1}` : ''}<br /><span className="muted small">{[g.email, g.phone].filter(Boolean).join(' · ') || (g.selfAdded ? tr("Replied from the link") : '—')}</span>{g.note && <><br /><span className="small">“{g.note}”</span></>}</td>
                    <td><span className={`badge ${g.status === 'yes' ? 'badge-green' : g.status === 'invited' ? '' : 'badge-purple'}`}>{tr(STATUS[g.status])}</span></td>
                    <td className="small">
                      {g.email && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('re' + g.id, async () => { await api(`/api/celebrations/${p.id}/invite`, { body: { guestIds: [g.id] } }); return tr('Invitation sent to {name}', { name: g.name }); })}>{g.invitedAt ? tr("Resend") : tr("Email")}</button>}
                      {g.phone && <a className="btn btn-ghost btn-sm" href={wa(g)} target="_blank" rel="noopener noreferrer">{tr("WhatsApp")}</a>}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(`${p.appUrl}/c/${p.slug}?g=${g.token}`)} aria-label={tr("Copy {name}’s personal link", { name: g.name })}>{tr("Copy link")}</button>
                    </td>
                    <td><button type="button" className="btn btn-ghost btn-sm" aria-label={tr("Remove {name}", { name: g.name })} disabled={!!busy} onClick={() => run('rm' + g.id, async () => { await api(`/api/celebrations/${p.id}/guests/${g.id}`, { method: 'DELETE' }); })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      )}

      {tab === 'Messages' && (
        <section className="stack" aria-label={tr("Messages")}>
          {p.posts.length === 0 && <p className="muted">{tr("No messages yet. Guests can leave messages, photos and videos on the page.")}</p>}
          <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {p.posts.map((x) => (
              <article key={x.id} className="card-box stack" style={{ gap: 8 }}>
                {x.media?.kind === 'image' && <img src={x.media.url} alt={tr("Photo from {name}", { name: x.name })} style={{ width: '100%', borderRadius: 10 }} />}
                {x.media?.kind === 'video' && <video src={x.media.url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 10 }} />}
                {x.message && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{x.message}</p>}
                <span className="muted small">— {x.name}{x.kind === 'memory' ? tr(" · memory") : ''}</span>
                <div className="row-wrap">
                  {!x.approved && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run('ap' + x.id, () => api(`/api/celebrations/${p.id}/posts/${x.id}`, { body: { action: 'approve' } }).then(() => undefined))}>{tr("Approve")}</button>}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('del' + x.id, () => api(`/api/celebrations/${p.id}/posts/${x.id}`, { body: { action: 'delete' } }).then(() => undefined))}>{tr("Delete")}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'Updates' && (
        <section className="stack-lg" aria-label={tr("Updates")}>
          {!p.cancelled && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('upd', async () => { const r = await api<{ update: { emailed: number } }>(`/api/celebrations/${p.id}/updates`, { body: { body: update } }); setUpdate(''); return tp(r.update.emailed, 'Update posted and emailed to {n} guest', 'Update posted and emailed to {n} guests'); }); }}>
              <label className="field">{tr("Post an update (shown on the page and emailed to guests who haven’t said no)")}<textarea className="textarea" value={update} onChange={(e) => setUpdate(e.target.value)} placeholder={tr("e.g. We’ve moved inside — same address, back door.")} maxLength={2000} style={{ minHeight: 90 }} />
              </label>
              <button type="submit" className="btn btn-sm" disabled={busy === 'upd' || update.trim().length < 3}>{tr("Post update")}</button>
            </form>
          )}
          {p.updates.length > 0 && <ul className="list">{p.updates.map((u) => <li key={u.id} className="item"><span style={{ whiteSpace: 'pre-line' }}>{u.body}</span><span className="muted small">{tr("{v} · emailed {emailed}", { v: new Date(u.createdAt).toLocaleString(), emailed: u.emailed })}</span></li>)}</ul>}
          {p.past && (
            <form className="stack card-box" onSubmit={(e) => { e.preventDefault(); void run('thx', async () => { const r = await api<{ emailed: number }>(`/api/celebrations/${p.id}/thanks`, { body: { message: thanks } }); return tp(r.emailed, 'Thank-you sent to {n} guest', 'Thank-you sent to {n} guests'); }); }}>
              <label className="field">{tr("Thank your guests (everyone who came or left a message, once)")}<textarea className="textarea" value={thanks} onChange={(e) => setThanks(e.target.value)} maxLength={2000} style={{ minHeight: 90 }} />
              </label>
              <button type="submit" className="btn btn-sm" disabled={busy === 'thx'}>{tr("Send thank-yous")}</button>
            </form>
          )}
          {!p.cancelled && !p.past && (
            <details className="card-box">
              <summary><b>{tr("Cancel the celebration")}</b></summary>
              <div className="stack" style={{ marginTop: 10 }}>
                <label className="field">{tr("Message to guests (optional)")}<input className="input" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={1000} /></label>
                <button type="button" className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => { if (confirm(tr("Cancel and tell your guests?"))) void run('cancel', async () => { await api(`/api/celebrations/${p.id}/cancel`, { body: { message: cancelNote } }); return 'Cancelled — guests have been told.'; }); }}>{tr("Cancel and tell guests")}</button>
              </div>
            </details>
          )}
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={() => { if (confirm(tr("Delete this celebration page, its guest list and all messages? This can’t be undone."))) void run('delete', async () => { await api(`/api/celebrations/${p.id}`, { method: 'DELETE' }); router.push('/celebrations'); }); }}>{tr("Delete page")}</button>
        </section>
      )}

      {tab === 'Details' && <CelebrationForm initial={p.form} id={p.id} wishlists={p.wishlists} />}
    </div>
  );
}
