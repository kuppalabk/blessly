'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/components/api';
import { useT } from '@/components/I18n';

const key = (slug: string) => `ww_c_${slug}`;
function remember(slug: string, token: string) { try { localStorage.setItem(key(slug), token); } catch { /* private mode */ } }
function recall(slug: string) { try { return localStorage.getItem(key(slug)); } catch { return null; } }

/** Remembers the guest's personal link on this device, and restores it on later visits. */
export function GuestToken({ slug, token }: { slug: string; token: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (token) remember(slug, token);
    else { const t = recall(slug); if (t) router.replace(`/c/${slug}?g=${encodeURIComponent(t)}`); }
  }, [slug, token, router]);
  return null;
}

export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const { t: tr } = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now === null) return <div className="countdown" aria-hidden style={{ visibility: 'hidden' }}>0</div>;
  const start = new Date(startsAt).getTime(), end = endsAt ? new Date(endsAt).getTime() : start + 6 * 3600000;
  if (now >= end) return null;
  if (now >= start) return <p className="countdown-live" role="status">{tr("🎉 It’s happening now!")}</p>;
  const s = Math.floor((start - now) / 1000);
  const parts: [number, string][] = [[Math.floor(s / 86400), 'days'], [Math.floor((s % 86400) / 3600), 'hours'], [Math.floor((s % 3600) / 60), 'minutes'], [s % 60, 'seconds']];
  return (
    <div className="countdown" role="timer" aria-label={tr("{v} days, {v2} hours and {v3} minutes to go", { v: parts[0][0], v2: parts[1][0], v3: parts[2][0] })}>
      {parts.map(([n, l]) => <div key={l}><b>{String(n).padStart(2, '0')}</b><span>{l}</span></div>)}
    </div>
  );
}

type Me = { name: string; status: string; partySize: number; diet: string | null; access: string | null; note: string | null; email: string | null; token: string } | null;

export function RsvpBox({ slug, me, maxPartySize, askDiet, askAccess, hostName, closed }: { slug: string; me: Me; maxPartySize: number; askDiet: boolean; askAccess: boolean; hostName: string; closed: string | null }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [status, setStatus] = useState<'yes' | 'no' | 'maybe' | null>(me && me.status !== 'invited' ? (me.status as 'yes') : null);
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [party, setParty] = useState(me?.partySize ?? 1);
  const [diet, setDiet] = useState(me?.diet ?? '');
  const [access, setAccess] = useState(me?.access ?? '');
  const [note, setNote] = useState(me?.note ?? '');
  const [editing, setEditing] = useState(!me || me.status === 'invited');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = hostName.split(' ')[0];

  if (closed) return <p className="muted">{closed}</p>;
  if (!editing && me) {
    const word = { yes: tr('You’re coming'), no: tr('You can’t make it'), maybe: tr('You might come') }[me.status as 'yes'] ?? '';
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 18 }}><b>{word}</b>{me.status === 'yes' && me.partySize > 1 ? tr(" · {partySize} people", { partySize: me.partySize }) : ''}. {tr("{name} has your answer.", { name: first })}</p>
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>{tr("Change my answer")}</button>
      </div>
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) { setError(tr("Choose an answer")); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/c/${slug}/rsvp`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ token: me?.token, status, name: me ? undefined : name, email, partySize: party, diet, access, note }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.error ?? tr('Could not send your answer'));
      remember(slug, json.token);
      setEditing(false);
      router.replace(`/c/${slug}?g=${encodeURIComponent(json.token)}`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : tr("Could not send your answer")); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} style={{ gap: 12 }}>
      <div className="seg" role="group" aria-label={tr("Can you come?")}>
        {([['yes', tr('Yes, I’ll be there')], ['maybe', tr('Maybe')], ['no', tr('Can’t make it')]] as const).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={status === v} data-v={v} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {!me && <label className="field">{tr("Your name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" /></label>}
      <label className="field">{tr("Email (for updates and a reminder)")}{!me && tr(" — optional")}<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></label>
      {status !== 'no' && maxPartySize > 1 && (
        <label className="field">{tr("How many people, including you?")}<select className="select" value={party} onChange={(e) => setParty(Number(e.target.value))}>{Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
      )}
      {status !== 'no' && askDiet && <label className="field">{tr("Dietary needs (optional)")}<input className="input" value={diet} onChange={(e) => setDiet(e.target.value)} maxLength={200} placeholder={tr("e.g. vegetarian, nut allergy")} /></label>}
      {status !== 'no' && askAccess && <label className="field">{tr("Accessibility needs (optional)")}<input className="input" value={access} onChange={(e) => setAccess(e.target.value)} maxLength={200} placeholder={tr("e.g. step-free access")} /></label>}
      <label className="field">{tr("Note for {name} (optional)", { name: first })}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-block" disabled={busy}>{busy ? tr("Sending…") : tr("Send my answer")}</button>
    </form>
  );
}

export function PostForm({ slug, token, defaultName, memory }: { slug: string; token: string | null; defaultName: string; memory: boolean }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      const form = new FormData();
      form.append('name', name); form.append('message', message);
      if (token) form.append('token', token);
      if (file) form.append('file', file);
      const res = await fetch(`/api/c/${slug}/posts`, { method: 'POST', body: form, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.error ?? tr('Could not post'));
      setMessage(''); setFile(null); if (input.current) input.current.value = '';
      setDone(json.post.approved ? tr("Posted — thank you!") : tr("Thanks! It will appear once the host approves it."));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : tr("Could not post")); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} style={{ gap: 10 }}>
      <label className="field">{tr("Your name")}<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
      <label className="field">{memory ? tr("Share a memory") : tr("Your message")}<textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} style={{ minHeight: 90 }} /></label>
      <label className="field">{tr("Photo or video (optional)")}<input ref={input} type="file" accept="image/*,video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="notice" role="status">{done}</p>}
      <button type="submit" className="btn" disabled={busy || !name.trim() || (!message.trim() && !file)}>{busy ? tr("Posting…") : memory ? tr("Add memory") : tr("Post message")}</button>
    </form>
  );
}
