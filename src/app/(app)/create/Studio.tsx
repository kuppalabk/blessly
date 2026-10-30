'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/components/api';
import { GreetingCard, ScriptFont } from '@/components/GreetingCard';
import { Icon } from '@/components/Icon';
import { OccasionChips } from '@/components/occasions/OccasionPicker';
import { GREETINGS, LANGUAGES, OCCASIONS, type LanguageCode, type OccasionId } from '@/lib/i18n-data';
import { DESIGNS_PER_OCCASION, cardDesign, designOrder, type CardOverrides } from '@/lib/cards';
import type { Page } from '@/lib/card-doc';
import { CardThumb } from '@/components/editor/DesignList';
import { MessageRecorder, type Recording } from '@/components/editor/MessageRecorder';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

export type StudioCard = { id: string; title: string; page: Page; urls: Record<string, string>; language: string };

type Person = { id: string; name: string; relationship: string; language: string; notes: string | null };
type Tone = 'heartfelt' | 'funny' | 'short' | 'poetic';
const TONES: [Tone, string][] = [['heartfelt', msg('Heartfelt')], ['funny', msg('Funny')], ['short', msg('Short')], ['poetic', msg('Poetic')]];
const PER_PAGE = 12;

export function Studio(props: { people: Person[]; initialOccasion: OccasionId; initialPersonId: string | null; senderName: string; defaultLanguage: string; aiEnabled: boolean; cardOverrides?: Record<string, CardOverrides>; card?: StudioCard | null }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [occasion, setOccasion] = useState<OccasionId>(props.initialOccasion);
  const [personId, setPersonId] = useState<string>(props.initialPersonId ?? '');
  const person = props.people.find((p) => p.id === personId) ?? null;
  const [recipientName, setRecipientName] = useState(person?.name.split(' ')[0] ?? '');
  const [language, setLanguage] = useState<LanguageCode>((LANGUAGES.some((l) => l.code === props.defaultLanguage) ? props.defaultLanguage : 'en') as LanguageCode);
  const [tone, setTone] = useState<Tone>('heartfelt');
  const [detail, setDetail] = useState(person?.notes ?? '');
  const [text, setText] = useState('');
  const [variant, setVariant] = useState(0);
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [designIndex, setDesignIndex] = useState(() => designOrder(props.cardOverrides?.[props.initialOccasion])[0] ?? 0);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<'draft' | 'save' | 'customise' | null>(null);
  const [card, setCard] = useState<StudioCard | null>(props.card ?? null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rtl = LANGUAGES.find((l) => l.code === language)?.rtl ?? false;
  const greeting = GREETINGS[occasion][language];

  useEffect(() => {
    const p = props.people.find((x) => x.id === personId);
    if (p) {
      setRecipientName(p.name.split(' ')[0]);
      if (LANGUAGES.some((l) => l.code === p.language)) setLanguage(p.language as LanguageCode);
      setDetail(p.notes ?? '');
    }
  }, [personId, props.people]);

  async function draft(nextVariant = variant, nextTone = tone) {
    if (!recipientName.trim()) { setError(tr("Who is this wish for?")); return; }
    setBusy('draft'); setError(null);
    try {
      const r = await api<{ draft: { text: string; source: 'ai' | 'template' } }>('/api/wishes/draft', {
        body: { occasion, language, tone: nextTone, recipientName, relationship: person?.relationship, senderName: props.senderName, detail: detail || undefined, variant: nextVariant }
      });
      setText(r.draft.text); setSource(r.draft.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Could not write the wish"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!text.trim()) { setError(tr("Write or generate the wish first")); return; }
    setBusy('save'); setError(null);
    try {
      const { wish } = await api<{ wish: { id: string } }>('/api/wishes', {
        body: { personId: personId || null, occasion, language, tone, text, designIndex, recipientName, senderName: props.senderName, cardDraftId: card?.id ?? null, messageFileId: recording?.id ?? null }
      });
      await api(`/api/wishes/${wish.id}/page`, { method: 'POST', body: {} });
      router.push(`/wishes/${wish.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Could not save"));
      setBusy(null);
    }
  }

  async function customise() {
    setBusy('customise'); setError(null);
    try {
      const { design } = await api<{ design: { id: string } }>('/api/designs', { body: { occasion, designIndex, language, to: recipientName.trim() || undefined, from: props.senderName, message: text.trim() ? text.slice(0, 600) : undefined } });
      router.push(`/designs/${design.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Could not open the editor"));
      setBusy(null);
    }
  }

  const order = useMemo(() => designOrder(props.cardOverrides?.[occasion]), [props.cardOverrides, occasion]);
  const pageCount = Math.ceil(order.length / PER_PAGE);
  const thumbs = useMemo(() => order.slice(page * PER_PAGE, (page + 1) * PER_PAGE), [order, page]);

  return (
    <div className="stack-lg">
      <ScriptFont language={language} />
      <header><h1>{tr("Create a wish")}</h1></header>

      <section className="stack" aria-labelledby="s1">
        <h2 id="s1">{tr("1 · Occasion and person")}</h2>
        <OccasionChips value={occasion} onChange={(id) => { setOccasion(id); setDesignIndex(designOrder(props.cardOverrides?.[id])[0] ?? 0); setPage(0); }} />
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{tr("From your people")}<select className="select" aria-label={tr("From your people")} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">{tr("Someone else")}</option>
              {props.people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.relationship}</option>)}
            </select>
          </label>
          <label className="field">{tr("Their name on the wish")}<input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={tr("e.g. Nisha")} />
          </label>
        </div>
      </section>

      <section className="stack" aria-labelledby="s2">
        <h2 id="s2">{tr("2 · Write the wish")}</h2>
        <div className="two-col" style={{ gap: 12 }}>
          <label className="field">{tr("Language")}<select className="select" aria-label={tr("Language")} value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="field">{tr("Personal detail (optional)")}<input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={tr("e.g. our Goa trip")} maxLength={200} />
          </label>
        </div>
        <div className="row-wrap" role="group" aria-label={tr("Tone")}>
          {TONES.map(([t, label]) => <button key={t} type="button" className="chip" aria-pressed={t === tone} onClick={() => setTone(t)}>{tr(label)}</button>)}
        </div>
        <div className="row-wrap">
          <button type="button" className="btn" onClick={() => { setVariant(0); draft(0); }} disabled={busy !== null}><Icon name="sparkle" size={18} />{busy === 'draft' ? tr("Writing…") : text ? tr("Rewrite") : tr("Write my wish")}</button>
          {text && <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => { const v = variant + 1; setVariant(v); draft(v); }}>{tr("Try another")}</button>}
        </div>
        <label className="field">{tr("Your wish (edit freely)")}<textarea className="textarea" dir={rtl ? 'rtl' : 'ltr'} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Tap “Write my wish”, or type your own.")} maxLength={2000} />
        </label>
        {source === 'template' && language !== 'en' && tone !== 'short' && <p className="muted small">{props.aiEnabled ? tr("AI was unavailable, so we used a built-in template.") : tr("Built-in template. Tone variations in this language need the AI writer to be switched on.")}</p>}
      </section>

      {card ? (
        <section className="stack" aria-labelledby="s3">
          <h2 id="s3">{tr("3 · Your card")}</h2>
          <div className="two-col">
            <div style={{ maxWidth: 340, width: '100%', justifySelf: 'center' }} className="card-tile">
              <CardThumb page={card.page} urls={card.urls} language={card.language} label={tr("Your card: {title}", { title: card.title })} />
            </div>
            <div className="stack">
              <p style={{ margin: 0 }}><strong>{card.title}</strong></p>
              <p className="muted small" style={{ margin: 0 }}>{tr("The wish page shows the front and inside of this card above your message.")}</p>
              <div className="row-wrap">
                <a className="btn btn-ghost btn-sm" href={`/designs/${card.id}`}>{tr("Edit card")}</a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCard(null)}>{tr("Use a ready-made design instead")}</button>
              </div>
            </div>
          </div>
        </section>
      ) : (
      <section className="stack" aria-labelledby="s3">
        <h2 id="s3">{tr("3 · Pick a card · design {n} · {shown} of {total} designs", { n: designIndex + 1, shown: order.length, total: DESIGNS_PER_OCCASION })}</h2>
        <div className="two-col">
          <div style={{ maxWidth: 340, width: '100%', justifySelf: 'center' }}>
            <GreetingCard occasion={occasion} designIndex={designIndex} greeting={greeting} to={recipientName || undefined} language={language} rtl={rtl} />
          </div>
          <div className="stack">
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
              {thumbs.map((i) => (
                <button key={i} type="button" className="wcard-btn" aria-pressed={i === designIndex} aria-label={`Design ${i + 1}: ${cardDesign(occasion, i).name}`} onClick={() => setDesignIndex(i)}>
                  <GreetingCard occasion={occasion} designIndex={i} greeting={greeting} language={language} rtl={rtl} label="" />
                </button>
              ))}
            </div>
            <div className="row between">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{tr("Previous")}</button>
              <span className="muted small">{tr("Page {page} of {pages}", { page: page + 1, pages: pageCount })}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>{tr("More designs")}</button>
            </div>
            <button type="button" className="btn btn-dark btn-sm" onClick={customise} disabled={busy !== null}>{busy === 'customise' ? tr("Opening editor…") : tr("✎ Customise this design")}</button>
            <p className="muted small" style={{ margin: 0 }}>{tr("Change words, fonts and colours, add photos, stickers, a signature or a QR code.")}</p>
          </div>
        </div>
      </section>
      )}

      <section className="stack" aria-labelledby="s4">
        <h2 id="s4">{tr("4 · Voice or video message (optional)")}</h2>
        <MessageRecorder value={recording} onChange={setRecording} />
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn btn-block" onClick={save} disabled={busy !== null}>{busy === 'save' ? tr("Saving…") : tr("Save and send")}</button>
    </div>
  );
}
