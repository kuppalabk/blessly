'use client';
import { useRouter } from 'next/navigation';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { useState } from 'react';
import { api } from '@/components/api';
import { GreetingCard } from '@/components/GreetingCard';
import { DESIGNS_PER_OCCASION } from '@/lib/cards';
import { GREETINGS, OCCASIONS, type OccasionId } from '@/lib/i18n-data';

type Row = { id: string; festivalId: string; name: string; occasion: string | null; regions: string; date: string; approximate: boolean; hidden: boolean };

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' }); } };
  const note = msg && <p className={msg.ok ? 'small' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>;
  return { run, note };
}

export function Festivals({ rows, missing, builtins }: { rows: Row[]; missing: { id: string; name: string; year: number }[]; builtins: { id: string; name: string; occasion: string | null; regions: string }[] }) {
  const { run, note } = useRun();
  const [v, setV] = useState({ festivalId: '', name: '', occasion: '', regions: 'IN', date: '', approximate: true, hidden: false });
  const pick = (id: string) => { const b = builtins.find((x) => x.id === id); setV({ ...v, festivalId: id, name: b?.name ?? '', occasion: b?.occasion ?? '', regions: b?.regions ?? 'IN' }); };
  return (
    <section className="card-box stack" aria-labelledby="fest-h">
      <h2 id="fest-h" style={{ fontSize: 19 }}>Festival calendar</h2>
      {missing.length > 0 && <p className="notice small">Dates needed: {missing.map((m) => `${m.name} ${m.year}`).join(', ')}.</p>}
      <form className="stack" aria-label="Add a festival date" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/festivals', { body: v }), 'Saved — users see it within a minute'); }}>
        <label className="field">Festival<select className="select" aria-label="Festival" value={builtins.some((b) => b.id === v.festivalId) ? v.festivalId : ''} onChange={(e) => pick(e.target.value)}><option value="">New festival…</option>{builtins.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <div className="two-col" style={{ gap: 10 }}>
          <label className="field">ID<input className="input" value={v.festivalId} onChange={(e) => setV({ ...v, festivalId: e.target.value })} placeholder="e.g. onam" /></label>
          <label className="field">Name<input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        </div>
        <div className="two-col" style={{ gap: 10 }}>
          <label className="field">Date<input className="input" type="date" aria-label="Festival date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
          <label className="field">Regions<input className="input" value={v.regions} onChange={(e) => setV({ ...v, regions: e.target.value })} placeholder="IN,GB,US,AE,GLOBAL" /></label>
        </div>
        <label className="field">Card set<select className="select" aria-label="Card set" value={v.occasion} onChange={(e) => setV({ ...v, occasion: e.target.value })}><option value="">None</option><OccasionOptions /></select></label>
        <label className="check"><input type="checkbox" checked={v.approximate} onChange={(e) => setV({ ...v, approximate: e.target.checked })} /><span>Date depends on moon sighting / local almanac (shown as “may vary”)</span></label>
        <label className="check"><input type="checkbox" checked={v.hidden} onChange={(e) => setV({ ...v, hidden: e.target.checked })} /><span>Hide this festival in this year</span></label>
        <button className="btn">Save date</button>
      </form>
      {note}
      <ul className="list small" style={{ gap: 4 }}>
        {rows.map((r) => <li key={r.id} className="row"><span className="grow"><b>{r.name}</b> · {r.date} · {r.regions}{r.approximate ? ' · may vary' : ''}{r.hidden ? ' · hidden' : ''}</span><button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/festivals/${r.id}`, { method: 'DELETE' }), 'Removed')}>Remove</button></li>)}
      </ul>
    </section>
  );
}

export function Cards({ overrides }: { overrides: Record<string, { hidden: number[]; featured: number[] }> }) {
  const { run, note } = useRun();
  const [occ, setOcc] = useState<OccasionId>('birthday');
  const [page, setPage] = useState(0);
  const o = overrides[occ] ?? { hidden: [], featured: [] };
  const idx = Array.from({ length: 24 }, (_, k) => page * 24 + k).filter((i) => i < DESIGNS_PER_OCCASION);
  const set = (i: number, hidden: boolean, featured: boolean) => run(() => api('/api/admin/cards', { method: 'PUT', body: { occasion: occ, designIndex: i, hidden, featured } }), 'Updated');
  return (
    <section className="card-box stack" aria-labelledby="cards-h">
      <h2 id="cards-h" style={{ fontSize: 19 }}>Card designs</h2>
      <p className="muted small">Featured designs show first; hidden ones aren’t offered. {o.featured.length} featured · {o.hidden.length} hidden for this occasion.</p>
      <label className="field" style={{ maxWidth: 260 }}>Occasion<select className="select" aria-label="Card occasion" value={occ} onChange={(e) => { setOcc(e.target.value as OccasionId); setPage(0); }}><OccasionOptions /></select></label>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {idx.map((i) => {
          const hidden = o.hidden.includes(i), featured = o.featured.includes(i);
          return (
            <div key={i} className="stack" style={{ gap: 4, opacity: hidden ? 0.4 : 1 }}>
              <GreetingCard occasion={occ} designIndex={i} greeting={GREETINGS[occ].en} language="en" label="" />
              <span className="wcard-meta">#{i + 1}{featured ? ' · featured' : ''}{hidden ? ' · hidden' : ''}</span>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-ghost btn-sm grow" style={{ padding: '0 6px', fontSize: 12 }} aria-label={`${featured ? 'Unfeature' : 'Feature'} design ${i + 1}`} onClick={() => set(i, false, !featured)}>{featured ? 'Unfeature' : 'Feature'}</button>
                <button className="btn btn-ghost btn-sm grow" style={{ padding: '0 6px', fontSize: 12 }} aria-label={`${hidden ? 'Show' : 'Hide'} design ${i + 1}`} onClick={() => set(i, !hidden, false)}>{hidden ? 'Show' : 'Hide'}</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row between"><button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="small muted">Page {page + 1} of {Math.ceil(DESIGNS_PER_OCCASION / 24)}</span><button className="btn btn-ghost btn-sm" disabled={(page + 1) * 24 >= DESIGNS_PER_OCCASION} onClick={() => setPage(page + 1)}>Next</button></div>
      {note}
    </section>
  );
}

export function Announcements({ history }: { history: { id: string; title: string; audience: string; recipients: number; createdAt: string }[] }) {
  const { run, note } = useRun();
  const [v, setV] = useState({ title: '', body: '', link: '', audience: 'all' });
  return (
    <section className="card-box stack" aria-labelledby="ann-h">
      <h2 id="ann-h" style={{ fontSize: 19 }}>Announcements</h2>
      <p className="muted small">Sends an alert to everyone in the audience (and a push notification to phones that turned them on).</p>
      <form className="stack" aria-label="New announcement" onSubmit={(e) => { e.preventDefault(); if (!window.confirm('Send this to everyone in the audience?')) return; run(async () => { await api('/api/admin/announcements', { body: v }); setV({ title: '', body: '', link: '', audience: v.audience }); }, 'Sent'); }}>
        <label className="field">Title<input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={120} /></label>
        <label className="field">Message<textarea className="textarea" style={{ minHeight: 80 }} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} maxLength={500} /></label>
        <div className="two-col" style={{ gap: 10 }}>
          <label className="field">Link (optional)<input className="input" value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} placeholder="/albums" /></label>
          <label className="field">Audience<select className="select" aria-label="Audience" value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })}>
            <option value="all">Everyone</option><option value="business">Business owners</option><option value="country:IN">India</option><option value="country:GB">United Kingdom</option><option value="country:US">United States</option><option value="country:AE">UAE</option>
          </select></label>
        </div>
        <button className="btn">Send announcement</button>
      </form>
      {note}
      <ul className="list small" style={{ gap: 4 }}>{history.map((h) => <li key={h.id}><b>{h.title}</b> · {h.audience} · {h.recipients} people · {new Date(h.createdAt).toLocaleDateString('en-GB')}</li>)}</ul>
    </section>
  );
}
