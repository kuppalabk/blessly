'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/I18n';

type Pt = [number, number];
const INKS = ['#1e1b2e', '#2b6cb0', '#b3261e', '#5b3fd1', '#1f6b4f', '#c2531a'];

/**
 * Draw a signature or a little doodle. The strokes become a vector path (scaled to a 1000-wide box),
 * so they stay sharp at any size and in print.
 */
export function SignaturePad({ onDone, onCancel }: { onDone: (d: { path: string; ratio: number; color: string }) => void; onCancel: () => void }) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const [color, setColor] = useState(INKS[0]);
  const [count, setCount] = useState(0);

  const draw = () => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#dcd5cc'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(20, h * 0.72); ctx.lineTo(w - 20, h * 0.72); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
  };
  useEffect(draw);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pt = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function finish() {
    const all = strokes.current.flat();
    if (!all.length) return;
    const pad = 4;
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const bw = Math.max(Math.max(...xs) + pad - minX, 10);
    const bh = Math.max(Math.max(...ys) + pad - minY, bw / 20);
    const k = 1000 / bw;
    const f = (n: number) => (Math.round(n * 10) / 10).toString();
    const path = strokes.current
      .map((s) => s.map(([x, y], i) => `${i ? 'L' : 'M'}${f((x - minX) * k)} ${f((y - minY) * k)}`).join(' ') + (s.length === 1 ? ` L${f((s[0][0] - minX) * k + 0.5)} ${f((s[0][1] - minY) * k)}` : ''))
      .join(' ');
    onDone({ path: path.slice(0, 60_000), ratio: Math.min(20, Math.max(0.05, bw / bh)), color });
  }

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="sig-title" style={{ gap: 12 }}>
        <h2 id="sig-title" style={{ margin: 0 }}>{t("Sign or draw")}</h2>
        <canvas
          ref={canvas}
          className="sig-canvas"
          aria-label={t("Drawing area")}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); current.current = [pt(e)]; draw(); }}
          onPointerMove={(e) => {
            if (!current.current) return;
            const p = pt(e), last = current.current[current.current.length - 1];
            if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.5) { current.current.push(p); draw(); }
          }}
          onPointerUp={() => { if (current.current) { strokes.current.push(current.current); current.current = null; setCount(strokes.current.length); } }}
        />
        <div className="row-wrap" role="group" aria-label={t("Ink colour")} style={{ gap: 6 }}>
          {INKS.map((c) => <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={t("Ink {c}", { c })} aria-pressed={c === color} onClick={() => setColor(c)} />)}
        </div>
        <div className="row between">
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!count} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); }}>{t("Undo stroke")}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!count} onClick={() => { strokes.current = []; setCount(0); }}>{t("Clear")}</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("Cancel")}</button>
            <button type="button" className="btn btn-sm" disabled={!count} onClick={finish}>{t("Add to card")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
