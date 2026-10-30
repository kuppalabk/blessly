'use client';
import QRCode from 'qrcode';
import { cardDesign } from './cards';
import { FONTS, type Background, type Layer, type Page } from './card-doc';

/**
 * Draws a card page onto a canvas. The editor shows this drawing and the export uses the same code,
 * so the card that is sent or printed is exactly what was designed.
 */

export const CARD_RATIO = 4 / 3; // height / width

const images = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}
/** Images already loaded (drawing must be synchronous during drags). */
const ready = new Map<string, HTMLImageElement>();
async function ensure(src: string) {
  if (ready.has(src)) return ready.get(src)!;
  const img = await loadImage(src);
  if (img) ready.set(src, img);
  return img;
}

export function fontFamily(fontId: string, scriptFont?: string) {
  const f = FONTS.find((x) => x.id === fontId) ?? FONTS[0];
  const primary = f.css.split(',')[0].trim();
  return `${primary}, ${scriptFont ? `'${scriptFont}', ` : ''}'Noto Color Emoji', sans-serif`;
}

export type Box = { id: string; cx: number; cy: number; w: number; h: number; rot: number };

/** Every source a page needs, so callers can preload before drawing. */
export function sourcesFor(page: Page, urls: Record<string, string>) {
  const out: string[] = [];
  if (page.background.kind === 'design') out.push(cardDesign(page.background.occasion, page.background.index).art.src);
  if (page.background.kind === 'photo' && urls[page.background.fileId]) out.push(urls[page.background.fileId]);
  for (const l of page.layers) if (l.type === 'image' && urls[l.fileId]) out.push(urls[l.fileId]);
  return out;
}
export async function preload(page: Page, urls: Record<string, string>) {
  await Promise.all(sourcesFor(page, urls).map(ensure));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, zoom = 1, ox = 0, oy = 0) {
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const x = (W - dw) / 2 + ox * (dw - W) / 2, y = (H - dh) / 2 + oy * (dh - H) / 2;
  ctx.drawImage(img, x, y, dw, dh);
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, urls: Record<string, string>, W: number, H: number) {
  if (bg.kind === 'color') {
    if (bg.color2) {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (bg.kind === 'photo') {
    ctx.fillStyle = '#eee9f5'; ctx.fillRect(0, 0, W, H);
    const img = ready.get(urls[bg.fileId] ?? '');
    if (img) drawCover(ctx, img, W, H, bg.zoom, bg.ox, bg.oy);
    return;
  }
  const d = cardDesign(bg.occasion, bg.index);
  ctx.fillStyle = d.palette.bg; ctx.fillRect(0, 0, W, H);
  const art = ready.get(d.art.src);
  if (art) drawCover(ctx, art, W, H);
  const dark = d.art.dark;
  ctx.save();
  if (d.layout === 'Ribbon') {
    ctx.globalAlpha = 0.93; ctx.fillStyle = d.palette.bg;
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = W * 0.04; ctx.shadowOffsetY = W * 0.01;
    ctx.fillRect(0, H * 0.4, W, H * 0.31);
  } else if (d.layout === 'Glass') {
    roundRect(ctx, W * 0.09, H * 0.37, W * 0.82, H * 0.36, W * 0.07);
    ctx.fillStyle = dark ? 'rgba(12,10,24,.55)' : 'rgba(255,255,255,.8)'; ctx.fill();
    ctx.lineWidth = Math.max(1, W / 400); ctx.strokeStyle = dark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.95)'; ctx.stroke();
  } else if (d.layout === 'Footer') {
    ctx.fillStyle = d.palette.bg; ctx.fillRect(0, H * 0.64, W, H * 0.36);
    ctx.fillStyle = d.palette.accent; ctx.fillRect(0, H * 0.64, W, W * 0.015);
  } else if (d.layout === 'Frame') {
    ctx.globalAlpha = 0.85; ctx.lineWidth = W * 0.01; ctx.strokeStyle = dark ? '#ffffff' : d.palette.accent;
    roundRect(ctx, W * 0.05 + ctx.lineWidth / 2, W * 0.05 + ctx.lineWidth / 2, W * 0.9 - ctx.lineWidth, H - W * 0.1 - ctx.lineWidth, W * 0.04); ctx.stroke();
  }
  ctx.restore();
}

/** Splits text into lines that fit `maxWidth`; long words (and CJK text without spaces) break by character. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((x) => x.length);
    let line = '';
    for (const word of words) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxWidth || !line.trim()) {
        if (ctx.measureText(test).width > maxWidth && !line.trim()) {
          // A single word wider than the box: break it.
          let chunk = '';
          for (const ch of Array.from(word)) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
        } else line = test;
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Shown in the editor for an empty text box; never drawn into an exported card. */
export const PLACEHOLDER = 'Tap to write your message…';

const qrCache = new Map<string, QRCode.QRCode>();
function qr(url: string) {
  let q = qrCache.get(url);
  if (!q) { q = QRCode.create(url, { errorCorrectionLevel: 'M' }); qrCache.set(url, q); }
  return q;
}

/** Height of a layer as a fraction of card width (text depends on wrapping, so it needs the context). */
function layerSize(ctx: CanvasRenderingContext2D, l: Layer, W: number, scriptFont?: string, editing = false): { w: number; h: number; lines?: string[] } {
  const w = l.w * W;
  if (l.type === 'text') {
    const px = l.size * W;
    ctx.font = `${l.italic ? 'italic ' : ''}${l.weight} ${px}px ${fontFamily(l.font, scriptFont)}`;
    const lines = wrapText(ctx, l.text || (editing ? PLACEHOLDER : ' '), w);
    return { w, h: lines.length * px * 1.18, lines };
  }
  if (l.type === 'image' || l.type === 'drawing') return { w, h: w / l.ratio };
  return { w, h: w };
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, urls: Record<string, string>, W: number, H: number, rtl: boolean, scriptFont?: string, editing = false): Box {
  const size = layerSize(ctx, l, W, scriptFont, editing);
  const cx = l.x * W, cy = l.y * H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((l.rot * Math.PI) / 180);
  const x0 = -size.w / 2, y0 = -size.h / 2;
  if (l.type === 'text') {
    const px = l.size * W;
    ctx.font = `${l.italic ? 'italic ' : ''}${l.weight} ${px}px ${fontFamily(l.font, scriptFont)}`;
    ctx.fillStyle = l.color;
    if (!l.text) ctx.globalAlpha = 0.35; // placeholder: shown while editing, never exported
    ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    // 'left' and 'right' are absolute in canvas (unlike 'start'/'end'), so they mean the same in RTL text.
    ctx.textAlign = l.align;
    const tx = l.align === 'center' ? 0 : l.align === 'left' ? x0 : x0 + size.w;
    if (l.shadow) {
      const light = isLight(l.color);
      ctx.shadowColor = light ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.95)';
      ctx.shadowBlur = px * 0.35; ctx.shadowOffsetY = px * 0.04;
    }
    size.lines!.forEach((line, i) => ctx.fillText(line, tx, y0 + px * 1.18 * (i + 0.5)));
  } else if (l.type === 'image') {
    const img = ready.get(urls[l.fileId] ?? '');
    const r = l.radius * Math.min(size.w, size.h);
    roundRect(ctx, x0, y0, size.w, size.h, r);
    if (l.border) { ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = W * 0.02; ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent'; }
    ctx.save(); ctx.clip();
    if (img) ctx.drawImage(img, x0, y0, size.w, size.h); else { ctx.fillStyle = '#e8e3f1'; ctx.fillRect(x0, y0, size.w, size.h); }
    ctx.restore();
    if (l.border) { ctx.lineWidth = W * 0.012; ctx.strokeStyle = '#fff'; roundRect(ctx, x0, y0, size.w, size.h, r); ctx.stroke(); }
  } else if (l.type === 'sticker') {
    ctx.font = `${size.w * 0.86}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l.emoji, 0, size.w * 0.04);
  } else if (l.type === 'drawing') {
    const s = size.w / 1000;
    ctx.translate(x0, y0); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = l.color; ctx.lineWidth = (l.stroke / 100) * W / s;
    ctx.stroke(new Path2D(l.path));
  } else if (l.type === 'qr') {
    const q = qr(l.url);
    const n = q.modules.size, quiet = 2, cell = size.w / (n + quiet * 2);
    ctx.fillStyle = l.bg; ctx.fillRect(x0, y0, size.w, size.w);
    ctx.fillStyle = l.color;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) ctx.fillRect(x0 + (c + quiet) * cell, y0 + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
  }
  ctx.restore();
  return { id: l.id, cx: l.x, cy: l.y, w: size.w / W, h: size.h / W, rot: l.rot };
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Draws a page at `W` pixels wide. Returns each layer's box (fractions of card width) for selecting and dragging. */
export function drawPage(canvas: HTMLCanvasElement, page: Page, urls: Record<string, string>, W: number, opts: { rtl?: boolean; scriptFont?: string; dpr?: number; editing?: boolean } = {}) {
  const dpr = opts.dpr ?? 1;
  const H = Math.round(W * CARD_RATIO);
  if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr);
  if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, page.background, urls, W, H);
  return page.layers.map((l) => drawLayer(ctx, l, urls, W, H, !!opts.rtl, opts.scriptFont, !!opts.editing));
}

/** Topmost layer under a point (fractions: x of width, y of height). */
export function hitTest(boxes: Box[], x: number, y: number) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    const px = x - b.cx, py = (y - b.cy) * CARD_RATIO; // to width units
    const a = (-b.rot * Math.PI) / 180;
    const rx = px * Math.cos(a) - py * Math.sin(a), ry = px * Math.sin(a) + py * Math.cos(a);
    if (Math.abs(rx) <= b.w / 2 + 0.01 && Math.abs(ry) <= b.h / 2 + 0.01) return b.id;
  }
  return null;
}

/** Renders a page to a PNG blob at print quality. */
export async function exportPage(page: Page, urls: Record<string, string>, W = 1500, opts: { rtl?: boolean; scriptFont?: string } = {}) {
  await preload(page, urls);
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  drawPage(canvas, page, urls, W, opts);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

/** Makes sure every font a page uses has loaded (canvas text doesn't trigger font downloads by itself). */
export async function loadFonts(pages: Page[], scriptFont?: string) {
  const specs = new Set<string>();
  for (const p of pages) for (const l of p.layers) if (l.type === 'text') specs.add(`${l.italic ? 'italic ' : ''}${l.weight} 40px ${fontFamily(l.font, scriptFont)}`);
  await Promise.all([...specs].map((s) => document.fonts.load(s).catch(() => undefined)));
}
