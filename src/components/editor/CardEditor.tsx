'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { api, ApiError } from '@/components/api';
import { GreetingCard, SCRIPT_FONT, ScriptFont } from '@/components/GreetingCard';
import { Icon } from '@/components/Icon';
import { OccasionOptions } from '@/components/occasions/OccasionPicker';
import { FONTS, STICKERS, newId, type Background, type CardDoc, type Layer } from '@/lib/card-doc';
import { CARD_RATIO, drawPage, exportPage, hitTest, loadFonts, preload, type Box } from '@/lib/card-render';
import { DESIGNS_PER_OCCASION } from '@/lib/cards';
import { GREETINGS, LANGUAGES, type OccasionId } from '@/lib/i18n-data';
import { SignaturePad } from './SignaturePad';
import { useT } from '@/components/I18n';

export type EditorDesign = { id: string; title: string; occasion: string; favourite: boolean; doc: CardDoc; urls: Record<string, string> };

const SWATCHES = ['#1e1b2e', '#ffffff', '#5b3fd1', '#c2531a', '#1f6b4f', '#b3261e', '#d4a017', '#e75480', '#2b6cb0', '#7a4b2a'];
const BACKGROUNDS: [string, string | null][] = [['#fffdf8', null], ['#fdf0e6', null], ['#ffe4ec', null], ['#e8f4ff', null], ['#eaf7ee', null], ['#1e1b2e', null], ['#ffe4ec', '#fff3c4'], ['#e0e7ff', '#fce7f3'], ['#d1fae5', '#e0f2fe'], ['#fde68a', '#fca5a5'], ['#312e81', '#9d174d'], ['#0f172a', '#334155']];
const HISTORY = 60;
type Panel = 'add' | 'background' | 'stickers' | 'qr' | null;
type Status = 'saved' | 'saving' | 'unsaved' | 'error';

export function CardEditor({ design, language: userLanguage, money = false }: { design: EditorDesign; language: string; money?: boolean }) {
  const { t: tr } = useT();
  const router = useRouter();
  const [doc, setDoc] = useState<CardDoc>(design.doc);
  const [urls, setUrls] = useState(design.urls);
  const [title, setTitle] = useState(design.title);
  const [favourite, setFavourite] = useState(design.favourite);
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('add');
  const [signing, setSigning] = useState(false);
  const [status, setStatus] = useState<Status>('saved');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const [width, setWidth] = useState(360);
  const [, setTick] = useState(0);

  const past = useRef<CardDoc[]>([]);
  const future = useRef<CardDoc[]>([]);
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const boxes = useRef<Box[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const first = useRef(true);
  const docRef = useRef(doc);
  docRef.current = doc;

  const language = doc.language || userLanguage;
  const rtl = LANGUAGES.find((l) => l.code === language)?.rtl ?? false;
  const scriptFont = SCRIPT_FONT[language];
  const page = doc.pages[pageIdx];
  const layer = page.layers.find((l) => l.id === selected) ?? null;

  /* ---------- history ---------- */
  const commit = useCallback((next: CardDoc | ((d: CardDoc) => CardDoc), mergeKey?: string) => {
    setDoc((cur) => {
      const n = typeof next === 'function' ? next(cur) : next;
      const now = Date.now();
      const merge = mergeKey && lastMerge.current?.key === mergeKey && now - lastMerge.current.at < 1200;
      if (!merge) { past.current = [...past.current.slice(-HISTORY), cur]; future.current = []; }
      lastMerge.current = mergeKey ? { key: mergeKey, at: now } : null;
      return n;
    });
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    lastMerge.current = null;
    setDoc(prev);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    lastMerge.current = null;
    setDoc(next);
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>, mergeKey?: string) => {
    commit((d) => ({ ...d, pages: d.pages.map((p, i) => (i !== pageIdx ? p : { ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) })) }), mergeKey ?? `${id}:${Object.keys(patch).join(',')}`);
  }, [commit, pageIdx]);
  const setBackground = (bg: Background, mergeKey?: string) => commit((d) => ({ ...d, pages: d.pages.map((p, i) => (i !== pageIdx ? p : { ...p, background: bg })) }), mergeKey);
  const addLayer = (l: Layer) => {
    commit((d) => ({ ...d, pages: d.pages.map((p, i) => (i !== pageIdx ? p : { ...p, layers: [...p.layers, l] })) }));
    setSelected(l.id);
  };
  const removeLayer = (id: string) => {
    commit((d) => ({ ...d, pages: d.pages.map((p, i) => (i !== pageIdx ? p : { ...p, layers: p.layers.filter((l) => l.id !== id) })) }));
    setSelected(null);
  };
  const moveLayer = (id: string, dir: 1 | -1) => commit((d) => ({
    ...d,
    pages: d.pages.map((p, i) => {
      if (i !== pageIdx) return p;
      const ls = [...p.layers]; const at = ls.findIndex((l) => l.id === id); const to = at + dir;
      if (at < 0 || to < 0 || to >= ls.length) return p;
      [ls[at], ls[to]] = [ls[to], ls[at]];
      return { ...p, layers: ls };
    })
  }));

  /* ---------- drawing ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    boxes.current = drawPage(canvasRef.current, docRef.current.pages[pageIdx], urls, width, { rtl, scriptFont, dpr: Math.min(window.devicePixelRatio || 1, 2.5), editing: true });
    setTick((t) => t + 1);
  }, [pageIdx, urls, width, rtl, scriptFont]);

  useEffect(() => { redraw(); }, [doc, redraw]);
  useEffect(() => {
    let live = true;
    Promise.all([preload(doc.pages[0], urls), preload(doc.pages[1], urls), loadFonts(doc.pages, scriptFont)]).then(() => live && redraw());
    return () => { live = false; };
  }, [doc, urls, scriptFont, redraw]);
  useEffect(() => {
    const f = () => redraw();
    document.fonts.addEventListener('loadingdone', f);
    return () => document.fonts.removeEventListener('loadingdone', f);
  }, [redraw]);

  /* ---------- autosave ---------- */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus('unsaved');
    const t = setTimeout(() => { void save(); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, title, favourite]);

  const saving = useRef<Promise<boolean> | null>(null);
  async function save(): Promise<boolean> {
    if (saving.current) await saving.current;
    const p = (async () => {
      setStatus('saving');
      try {
        await api(`/api/designs/${design.id}`, { method: 'PUT', body: { doc: docRef.current, title: title.trim() || design.title, favourite } });
        setStatus('saved'); setError(null);
        return true;
      } catch (e) {
        setStatus('error'); setError(e instanceof Error ? e.message : tr("Could not save"));
        return false;
      }
    })();
    saving.current = p;
    const ok = await p;
    saving.current = null;
    return ok;
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
      if (typing || !selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLayer(selected); }
      const step = e.shiftKey ? 0.05 : 0.01;
      const l = docRef.current.pages[pageIdx].layers.find((x) => x.id === selected);
      if (!l) return;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) { e.preventDefault(); updateLayer(l.id, { x: clamp(l.x + d[e.key][0]), y: clamp(l.y + d[e.key][1]) }, `${l.id}:nudge`); }
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pageIdx, undo, redo, updateLayer]);

  /* ---------- pointer: select, move, resize, rotate ---------- */
  const drag = useRef<null | { mode: 'move' | 'resize' | 'rotate'; id: string; start: { x: number; y: number }; layer: Layer; moved: boolean }>(null);
  const toFrac = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  function onPointerDown(e: RPointerEvent<HTMLDivElement>, mode: 'move' | 'resize' | 'rotate' = 'move', forced?: string) {
    const p = toFrac(e);
    const id = forced ?? hitTest(boxes.current, p.x, p.y);
    setSelected(id);
    if (!id) return;
    const l = page.layers.find((x) => x.id === id)!;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id, start: p, layer: l, moved: false };
  }
  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g) return;
    const p = toFrac(e);
    const l = g.layer;
    if (!g.moved) { past.current = [...past.current.slice(-HISTORY), docRef.current]; future.current = []; g.moved = true; }
    let patch: Partial<Layer> = {};
    if (g.mode === 'move') {
      let x = clamp(l.x + p.x - g.start.x), y = clamp(l.y + p.y - g.start.y);
      const snap = Math.abs(x - 0.5) < 0.012;
      if (snap) x = 0.5;
      setGuide(snap);
      patch = { x, y };
    } else if (g.mode === 'resize') {
      const d0 = Math.hypot(g.start.x - l.x, (g.start.y - l.y) * CARD_RATIO), d1 = Math.hypot(p.x - l.x, (p.y - l.y) * CARD_RATIO);
      const k = Math.max(0.1, Math.min(8, d1 / Math.max(d0, 0.01)));
      const w = Math.max(0.04, Math.min(1.6, l.w * k));
      patch = l.type === 'text' ? { w, size: Math.max(0.015, Math.min(0.35, l.size * (w / l.w))) } : { w };
    } else {
      let deg = (Math.atan2((p.y - l.y) * CARD_RATIO, p.x - l.x) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      for (const s of [0, 90, -90, 180, -180, 45, -45]) if (Math.abs(deg - s) < 4) deg = s;
      patch = { rot: Math.round(deg) };
    }
    setDoc((d) => ({ ...d, pages: d.pages.map((pg, i) => (i !== pageIdx ? pg : { ...pg, layers: pg.layers.map((x) => (x.id === g.id ? ({ ...x, ...patch } as Layer) : x)) })) }));
  }
  function onPointerUp() { drag.current = null; setGuide(false); lastMerge.current = null; }

  /* ---------- adding things ---------- */
  const addText = () => addLayer({ type: 'text', id: newId(), x: 0.5, y: 0.5, w: 0.7, rot: 0, text: '', font: 'caveat', size: 0.07, color: page.background.kind === 'color' && isDark(page.background.color) ? '#ffffff' : '#1e1b2e', align: 'center', weight: 700, italic: false, shadow: false });
  const addSticker = (emoji: string) => addLayer({ type: 'sticker', id: newId(), x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.3 + Math.random() * 0.2, w: 0.18, rot: 0, emoji });

  async function upload(file: File) {
    const form = new FormData(); form.append('photo', file);
    const res = await fetch(`/api/designs/${design.id}/files`, { method: 'POST', body: form, credentials: 'same-origin' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.error ?? tr('Upload failed'));
    const f = json.file as { id: string; url: string; width: number; height: number };
    setUrls((u) => ({ ...u, [f.id]: f.url }));
    return f;
  }
  async function onPhoto(file: File | undefined, as: 'layer' | 'background') {
    if (!file) return;
    setBusy('photo'); setError(null);
    try {
      const f = await upload(file);
      if (as === 'background') setBackground({ kind: 'photo', fileId: f.id, zoom: 1, ox: 0, oy: 0 });
      else addLayer({ type: 'image', id: newId(), x: 0.5, y: 0.45, w: 0.5, rot: 0, fileId: f.id, ratio: f.width / f.height, radius: 0.04, border: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Upload failed"));
    } finally {
      setBusy(null);
      if (photoInput.current) photoInput.current.value = '';
      if (bgInput.current) bgInput.current.value = '';
    }
  }

  /* ---------- finishing ---------- */
  async function renders() {
    const ids = await Promise.all(doc.pages.map(async (p, i) => {
      const blob = await exportPage(p, urls, 1500, { rtl, scriptFont });
      const res = await fetch(`/api/designs/${design.id}/render?page=${i === 0 ? 'front' : 'inside'}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/png' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? tr("Could not save the card picture"));
      return blob;
    }));
    return ids;
  }
  async function useCard() {
    setBusy('use'); setError(null);
    try {
      if (!(await save())) throw new Error(tr("Could not save the card"));
      await renders();
      const bg = doc.pages[0].background;
      router.push(`/create?card=${design.id}${bg.kind === 'design' ? `&occasion=${bg.occasion}` : `&occasion=${design.occasion}`}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Something went wrong")); setBusy(null);
    }
  }
  async function printCards() {
    setBusy('print'); setError(null);
    try {
      if (!(await save())) throw new Error(tr("Could not save the card"));
      await renders();
      router.push(`/designs/${design.id}/print`);
    } catch (e) { setError(e instanceof Error ? e.message : tr("Something went wrong")); setBusy(null); }
  }
  async function useCommunity(id: string) {
    setBusy('photo'); setError(null);
    try {
      const { file } = await api<{ file: { id: string; url: string } }>(`/api/community-designs/${id}`, { body: {} });
      setUrls((u) => ({ ...u, [file.id]: file.url }));
      setBackground({ kind: 'photo', fileId: file.id, zoom: 1, ox: 0, oy: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : tr("Could not use that design")); } finally { setBusy(null); }
  }

  async function download(kind: 'png' | 'pdf') {
    setBusy(kind); setError(null);
    try {
      const name = (title || 'card').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'card';
      if (kind === 'png') {
        saveBlob(await exportPage(page, urls, 1500, { rtl, scriptFont }), `${name}${pageIdx ? ' (inside)' : ''}.png`);
      } else {
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.create();
        pdf.setTitle(name); pdf.setCreator('Blessly');
        const mm = 72 / 25.4;
        for (const p of doc.pages) {
          const png = await pdf.embedPng(await (await exportPage(p, urls, 1800, { rtl, scriptFont })).arrayBuffer());
          const pg = pdf.addPage([150 * mm, 200 * mm]);
          pg.drawImage(png, { x: 0, y: 0, width: 150 * mm, height: 200 * mm });
        }
        saveBlob(new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }), `${name}.pdf`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Could not export"));
    } finally { setBusy(null); }
  }

  const sel = layer ? boxes.current.find((b) => b.id === layer.id) : null;
  const canUndo = past.current.length > 0, canRedo = future.current.length > 0;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <ScriptFont language={language} />
      <header className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await save(); router.push('/designs'); }} aria-label={tr("Back to my cards")}><Icon name="back" size={18} /></button>
          <input className="input" aria-label={tr("Card name")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} style={{ fontWeight: 700, minWidth: 0 }} />
          <button type="button" className="chip" aria-pressed={favourite} onClick={() => setFavourite(!favourite)} aria-label={favourite ? tr("Remove from favourites") : tr("Add to favourites")}>{favourite ? '★' : '☆'}</button>
        </div>
        <p className="muted small" role="status" aria-live="polite" style={{ margin: 0 }}>{status === 'saving' ? tr("Saving…") : status === 'unsaved' ? tr("Unsaved changes") : status === 'error' ? tr("Not saved") : tr("All changes saved")}</p>
      </header>

      <div className="editor">
        <div className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <div className="row" role="group" aria-label={tr("Page")} style={{ gap: 6 }}>
              {[tr('Front'), tr('Inside')].map((n, i) => <button key={i} type="button" className="chip" aria-pressed={pageIdx === i} onClick={() => { setPageIdx(i); setSelected(null); }}>{n}</button>)}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!canUndo} aria-label={tr("Undo")}>↶</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={redo} disabled={!canRedo} aria-label={tr("Redo")}>↷</button>
            </div>
          </div>
          <div
            ref={wrapRef}
            className="editor-stage"
            onPointerDown={(e) => onPointerDown(e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => layer?.type === 'text' && textRef.current?.focus()}
          >
            <canvas ref={canvasRef} role="img" aria-label={pageIdx === 0 ? tr('Front of the card') : tr('Inside of the card')} style={{ width: '100%', height: 'auto', display: 'block' }} />
            {guide && <div className="editor-guide" aria-hidden />}
            {sel && layer && (
              <div className="editor-sel" aria-hidden style={{ left: `${sel.cx * 100}%`, top: `${sel.cy * 100}%`, width: `${sel.w * 100}%`, height: `${(sel.h / CARD_RATIO) * 100}%`, transform: `translate(-50%, -50%) rotate(${sel.rot}deg)` }}>
                <span className="editor-handle editor-rotate" onPointerDown={(e) => onPointerDown(e as unknown as RPointerEvent<HTMLDivElement>, 'rotate', layer.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
                <span className="editor-handle editor-resize" onPointerDown={(e) => onPointerDown(e as unknown as RPointerEvent<HTMLDivElement>, 'resize', layer.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
              </div>
            )}
          </div>
          <p className="muted small" style={{ margin: 0 }}>{tr("Tap something to select it. Drag to move, use the corner to resize and the top dot to rotate.")}</p>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <div className="row-wrap" role="group" aria-label={tr("Tools")}>
            <button type="button" className="chip" aria-pressed={panel === 'add'} onClick={() => setPanel('add')}>{tr("Add")}</button>
            <button type="button" className="chip" aria-pressed={panel === 'stickers'} onClick={() => setPanel('stickers')}>{tr("Stickers")}</button>
            <button type="button" className="chip" aria-pressed={panel === 'background'} onClick={() => setPanel('background')}>{tr("Background")}</button>
            <button type="button" className="chip" aria-pressed={panel === 'qr'} onClick={() => setPanel('qr')}>{tr("QR code")}</button>
          </div>

          {panel === 'add' && (
            <div className="row-wrap">
              <button type="button" className="btn btn-sm" onClick={addText}>{tr("+ Text")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => photoInput.current?.click()} disabled={busy === 'photo'}>{busy === 'photo' ? tr("Uploading…") : tr("+ Photo")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSigning(true)}>{tr("+ Signature or drawing")}</button>
              {language !== 'en' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                const bg = doc.pages[0].background;
                const occ = (bg.kind === 'design' ? bg.occasion : design.occasion) as OccasionId;
                const g = GREETINGS[occ]?.[language as keyof (typeof GREETINGS)[OccasionId]];
                if (g) addLayer({ type: 'text', id: newId(), x: 0.5, y: 0.5, w: 0.8, rot: 0, text: g, font: 'bricolage', size: 0.08, color: '#1e1b2e', align: 'center', weight: 700, italic: false, shadow: false });
              }}>{tr("+ Greeting")}</button>}
              <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0], 'layer')} aria-label={tr("Photo to add")} />
            </div>
          )}
          {panel === 'stickers' && (
            <div className="sticker-grid" role="group" aria-label={tr("Stickers")}>
              {STICKERS.map((s) => <button key={s} type="button" onClick={() => addSticker(s)} aria-label={tr("Add {s}", { s })}>{s}</button>)}
            </div>
          )}
          {panel === 'qr' && <QrPanel onAdd={(url) => addLayer({ type: 'qr', id: newId(), x: 0.78, y: 0.82, w: 0.26, rot: 0, url, color: '#1e1b2e', bg: '#ffffff' })} />}
          {panel === 'background' && (
            <BackgroundPanel
              bg={page.background}
              fallbackOccasion={(design.occasion as OccasionId)}
              language={language}
              onChange={setBackground}
              onPhoto={() => bgInput.current?.click()}
              uploading={busy === 'photo'}
              community={money ? useCommunity : null}
            />
          )}
          <input ref={bgInput} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0], 'background')} aria-label={tr("Background photo")} />

          {layer && (
            <section className="card-box stack" style={{ gap: 10 }} aria-label={tr("Selected item")}>
              <div className="row between">
                <strong>{({ text: tr('Text'), image: tr('Photo'), sticker: tr('Sticker'), drawing: tr('Drawing'), qr: tr('QR code') })[layer.type]}</strong>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLayer(layer.id, -1)} aria-label={tr("Send backward")}>↓</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLayer(layer.id, 1)} aria-label={tr("Bring forward")}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLayer({ ...layer, id: newId(), x: clamp(layer.x + 0.04), y: clamp(layer.y + 0.04) })} aria-label={tr("Duplicate")}>⧉</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLayer(layer.id)} aria-label={tr("Delete")}>✕</button>
                </div>
              </div>
              {layer.type === 'text' && (
                <>
                  <textarea ref={textRef} placeholder={tr("Type your words")} className="textarea" style={{ minHeight: 80 }} dir={rtl ? 'rtl' : 'ltr'} aria-label={tr("Text")} value={layer.text} maxLength={600} onChange={(e) => updateLayer(layer.id, { text: e.target.value })} />
                  <div className="two-col" style={{ gap: 8 }}>
                    <label className="field">{tr("Font")}<select className="select" value={layer.font} onChange={(e) => updateLayer(layer.id, { font: e.target.value })}>
                        {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </label>
                    <label className="field">{tr("Size")}<input type="range" min={0.02} max={0.2} step={0.002} value={layer.size} onChange={(e) => updateLayer(layer.id, { size: Number(e.target.value) })} />
                    </label>
                  </div>
                  <div className="row-wrap" role="group" aria-label={tr("Style")}>
                    {(['left', 'center', 'right'] as const).map((a) => <button key={a} type="button" className="chip" aria-pressed={layer.align === a} onClick={() => updateLayer(layer.id, { align: a })}>{a === 'left' ? tr("Left") : a === 'center' ? tr("Centre") : tr("Right")}</button>)}
                    <button type="button" className="chip" aria-pressed={layer.weight === 700} onClick={() => updateLayer(layer.id, { weight: layer.weight === 700 ? 400 : 700 })}><b>B</b></button>
                    <button type="button" className="chip" aria-pressed={layer.italic} onClick={() => updateLayer(layer.id, { italic: !layer.italic })}><i>I</i></button>
                    <button type="button" className="chip" aria-pressed={layer.shadow} onClick={() => updateLayer(layer.id, { shadow: !layer.shadow })}>{tr("Glow")}</button>
                  </div>
                  <ColorRow value={layer.color} onChange={(c) => updateLayer(layer.id, { color: c })} label={tr("Text colour")} />
                </>
              )}
              {layer.type === 'image' && (
                <div className="row-wrap">
                  <label className="field" style={{ flex: 1, minWidth: 140 }}>{tr("Rounded corners")}<input type="range" min={0} max={0.5} step={0.01} value={layer.radius} onChange={(e) => updateLayer(layer.id, { radius: Number(e.target.value) })} />
                  </label>
                  <label className="check"><input type="checkbox" checked={layer.border} onChange={(e) => updateLayer(layer.id, { border: e.target.checked })} /> {' '}{tr("White border")}</label>
                </div>
              )}
              {layer.type === 'drawing' && (
                <>
                  <ColorRow value={layer.color} onChange={(c) => updateLayer(layer.id, { color: c })} label={tr("Ink colour")} />
                  <label className="field">{tr("Line thickness")}<input type="range" min={0.2} max={3} step={0.1} value={layer.stroke} onChange={(e) => updateLayer(layer.id, { stroke: Number(e.target.value) })} />
                  </label>
                </>
              )}
              {layer.type === 'qr' && (
                <>
                  <label className="field">{tr("Link")}<input className="input" value={layer.url} onChange={(e) => { if (/^https?:\/\/\S+$/.test(e.target.value)) updateLayer(layer.id, { url: e.target.value }); }} />
                  </label>
                  <ColorRow value={layer.color} onChange={(c) => updateLayer(layer.id, { color: c })} label={tr("QR colour")} />
                </>
              )}
              <label className="field">{tr("Size")}<input type="range" min={0.05} max={1.2} step={0.01} value={layer.w} onChange={(e) => {
                  const w = Number(e.target.value);
                  updateLayer(layer.id, layer.type === 'text' ? { w, size: Math.max(0.015, Math.min(0.35, layer.size * (w / layer.w))) } : { w }, `${layer.id}:w`);
                }} />
              </label>
              <label className="field">{tr("Rotation ·")}{' '}{layer.rot}°
                <input type="range" min={-180} max={180} step={1} value={layer.rot} onChange={(e) => updateLayer(layer.id, { rot: Number(e.target.value) })} />
              </label>
            </section>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="stack" style={{ gap: 8 }}>
            <button type="button" className="btn btn-block" onClick={useCard} disabled={!!busy}>{busy === 'use' ? tr("Preparing your card…") : tr("Use this card for a wish")}</button>
            <div className="row-wrap">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('png')} disabled={!!busy}>{busy === 'png' ? tr("Exporting…") : `Download ${pageIdx ? 'inside' : 'front'} (PNG)`}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('pdf')} disabled={!!busy}>{busy === 'pdf' ? tr("Exporting…") : tr("Print-ready PDF")}</button>
              {money && <button type="button" className="btn btn-ghost btn-sm" onClick={printCards} disabled={!!busy}>{busy === 'print' ? tr("Preparing…") : tr("✉️ Print and post it")}</button>}
            </div>
            <p className="muted small" style={{ margin: 0 }}>{tr("The PDF has the front and inside as 15 × 20 cm pages — print double-sided, or at a print shop.")}</p>
          </div>
        </div>
      </div>

      {signing && (
        <SignaturePad
          onCancel={() => setSigning(false)}
          onDone={(d) => { setSigning(false); addLayer({ type: 'drawing', id: newId(), x: 0.5, y: pageIdx ? 0.88 : 0.75, w: Math.min(0.6, Math.max(0.2, d.ratio * 0.2)), rot: 0, path: d.path, ratio: d.ratio, color: d.color, stroke: 0.7 }); }}
        />
      )}
    </div>
  );
}

function clamp(v: number) { return Math.max(-0.2, Math.min(1.2, Math.round(v * 1000) / 1000)); }
function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 120;
}
function saveBlob(b: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function ColorRow({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const { t: tr } = useT();
  return (
    <div className="row-wrap" role="group" aria-label={label} style={{ gap: 6 }}>
      {SWATCHES.map((c) => <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} aria-pressed={value.toLowerCase() === c} onClick={() => onChange(c)} />)}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={tr("Custom {v}", { v: label.toLowerCase() })} className="swatch" />
    </div>
  );
}

function QrPanel({ onAdd }: { onAdd: (url: string) => void }) {
  const { t: tr } = useT();
  const [url, setUrl] = useState('https://');
  const ok = /^https?:\/\/[^\s/]+\.[^\s]+$/.test(url);
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (ok) onAdd(url); }}>
      <label className="field">{tr("Link for the QR code (a video, playlist, photo album, gift…)")}<input className="input" value={url} onChange={(e) => setUrl(e.target.value.trim())} inputMode="url" />
      </label>
      <button type="submit" className="btn btn-sm" disabled={!ok}>{tr("Add QR code")}</button>
    </form>
  );
}

function BackgroundPanel({ bg, fallbackOccasion, language, onChange, onPhoto, uploading, community }: { bg: Background; fallbackOccasion: OccasionId; language: string; onChange: (b: Background, merge?: string) => void; onPhoto: () => void; uploading: boolean; community: ((id: string) => void) | null }) {
  const { t: tr } = useT();
  const [occasion, setOccasion] = useState<OccasionId>(bg.kind === 'design' ? bg.occasion : fallbackOccasion);
  const [pageNo, setPageNo] = useState(bg.kind === 'design' ? Math.floor(bg.index / 12) : 0);
  const per = 12, pages = Math.ceil(DESIGNS_PER_OCCASION / per);
  const designs = useMemo(() => Array.from({ length: per }, (_, i) => pageNo * per + i).filter((i) => i < DESIGNS_PER_OCCASION), [pageNo]);
  const [extra, setExtra] = useState<{ id: string; title: string; by: string; imageUrl: string }[]>([]);
  useEffect(() => {
    if (!community) return;
    let live = true;
    api<{ designs: typeof extra }>(`/api/community-designs?occasion=${occasion}`).then((r) => live && setExtra(r.designs)).catch(() => undefined);
    return () => { live = false; };
  }, [occasion, community]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <p className="field" style={{ margin: '0 0 6px' }}>{tr("Colour")}</p>
        <div className="row-wrap" style={{ gap: 6 }}>
          {BACKGROUNDS.map(([a, b]) => (
            <button key={a + b} type="button" className="swatch swatch-lg" style={{ background: b ? `linear-gradient(160deg, ${a}, ${b})` : a }} aria-label={b ? tr("Gradient {a} to {b}", { a, b }) : tr("Colour {a}", { a })} aria-pressed={bg.kind === 'color' && bg.color === a && bg.color2 === b} onClick={() => onChange({ kind: 'color', color: a, color2: b })} />
          ))}
          <input type="color" className="swatch swatch-lg" aria-label={tr("Custom background colour")} value={bg.kind === 'color' ? bg.color : '#ffffff'} onChange={(e) => onChange({ kind: 'color', color: e.target.value, color2: null }, 'bg-color')} />
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row between"><span className="field">{tr("Your photo")}</span><button type="button" className="btn btn-ghost btn-sm" onClick={onPhoto} disabled={uploading}>{uploading ? tr("Uploading…") : tr("Upload photo")}</button></div>
        {bg.kind === 'photo' && (
          <div className="two-col" style={{ gap: 8 }}>
            <label className="field">{tr("Zoom")}<input type="range" min={1} max={3} step={0.01} value={bg.zoom} onChange={(e) => onChange({ ...bg, zoom: Number(e.target.value) }, 'bg-zoom')} /></label>
            <label className="field">{tr("Left ↔ right")}<input type="range" min={-1} max={1} step={0.01} value={bg.ox} onChange={(e) => onChange({ ...bg, ox: Number(e.target.value) }, 'bg-ox')} /></label>
            <label className="field">{tr("Up ↕ down")}<input type="range" min={-1} max={1} step={0.01} value={bg.oy} onChange={(e) => onChange({ ...bg, oy: Number(e.target.value) }, 'bg-oy')} /></label>
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label className="field">{tr("Card design")}<select className="select" value={occasion} onChange={(e) => { setOccasion(e.target.value as OccasionId); setPageNo(0); }}><OccasionOptions /></select>
        </label>
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
          {designs.map((i) => (
            <button key={i} type="button" className="wcard-btn" aria-label={`Design ${i + 1}`} aria-pressed={bg.kind === 'design' && bg.occasion === occasion && bg.index === i} onClick={() => onChange({ kind: 'design', occasion, index: i })}>
              <GreetingCard occasion={occasion} designIndex={i} greeting="" language={language} label="" />
            </button>
          ))}
        </div>
        {community && extra.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="field">{tr("By independent designers")}</span>
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
              {extra.map((d) => <button key={d.id} type="button" className="wcard-btn" aria-label={tr("{title} by {by}", { title: d.title, by: d.by })} onClick={() => community(d.id)}><img src={d.imageUrl} alt="" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8 }} /></button>)}
            </div>
          </div>
        )}
        <div className="row between">
          <button type="button" className="btn btn-ghost btn-sm" disabled={pageNo === 0} onClick={() => setPageNo(pageNo - 1)}>{tr("Previous")}</button>
          <span className="muted small">{pageNo + 1} / {pages}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pageNo >= pages - 1} onClick={() => setPageNo(pageNo + 1)}>{tr("More")}</button>
        </div>
      </div>
    </div>
  );
}
