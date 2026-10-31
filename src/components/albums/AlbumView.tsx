'use client';
import type { CSSProperties } from 'react';
import { albumDesign } from '@/lib/albums';
import { useT } from '@/components/I18n';

export type ViewPhoto = { id: string; thumbUrl: string; fullUrl: string; width: number; height: number; caption: string | null };

/** Renders an album in one of the 100 designs. Pure markup — used by the editor preview and the public page. */
/** titleAs="h1" on the public album page; previews inside other pages use a paragraph so each page keeps one main heading. */
export function AlbumView({ title, subtitle, designIndex, photos, mini = false, titleAs = 'p' }: { title: string; subtitle?: string; designIndex: number; photos: ViewPhoto[]; mini?: boolean; titleAs?: 'h1' | 'p' }) {
  const { t } = useT();
  const Title = titleAs;
  const d = albumDesign(designIndex);
  const { theme, frame, layout } = d;
  const imgBox = (rot = 0): CSSProperties => ({
    background: frame.pad ? theme.panel : undefined, padding: frame.pad ? (mini ? 2 : frame.pad) : 0, borderRadius: frame.radius, border: frame.border, boxShadow: frame.shadow,
    overflow: 'hidden', transform: rot ? `rotate(${rot}deg)` : undefined
  });
  const img = (p: ViewPhoto, crop: boolean, big = false): CSSProperties => ({ display: 'block', width: '100%', height: crop ? '100%' : 'auto', aspectRatio: crop ? '1 / 1' : `${p.width} / ${p.height}`, objectFit: 'cover', borderRadius: Math.max(0, frame.radius - (frame.pad ? 2 : 0)), maxHeight: big ? '78vh' : undefined });
  const caption = (p: ViewPhoto) => p.caption && !mini ? <figcaption style={{ fontFamily: theme.font, color: theme.ink, fontSize: layout.id === 'polaroid' ? 20 : 14, padding: '6px 2px 0', textAlign: layout.id === 'polaroid' ? 'center' : undefined }}>{p.caption}</figcaption> : null;
  const gap = mini ? 3 : 14;
  let body;
  if (!photos.length) body = <p style={{ color: theme.ink, opacity: .7, textAlign: 'center', padding: mini ? 4 : 40 }}>{mini ? '' : t("No photos yet")}</p>;
  else if (layout.id === 'grid') body = <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mini ? 3 : 'auto-fill'}, minmax(${mini ? 0 : 160}px, 1fr))`, gap }}>{photos.map((p) => <figure key={p.id} style={{ margin: 0 }}><div style={imgBox()}><img src={p.thumbUrl} alt={p.caption ?? ''} loading="lazy" style={img(p, true)} /></div>{caption(p)}</figure>)}</div>;
  else if (layout.id === 'masonry') body = <div style={{ columnCount: mini ? 2 : undefined, columns: mini ? undefined : '220px', columnGap: gap }}>{photos.map((p) => <figure key={p.id} style={{ margin: `0 0 ${gap}px`, breakInside: 'avoid' }}><div style={imgBox()}><img src={p.thumbUrl} alt={p.caption ?? ''} loading="lazy" style={img(p, false)} /></div>{caption(p)}</figure>)}</div>;
  else if (layout.id === 'polaroid') body = <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mini ? 2 : 'auto-fill'}, minmax(${mini ? 0 : 200}px, 1fr))`, gap: mini ? 4 : 26, padding: mini ? 2 : 10 }}>{photos.map((p, i) => <figure key={p.id} style={{ margin: 0, background: '#fff', padding: mini ? '3px 3px 8px' : '12px 12px 18px', boxShadow: '0 6px 16px rgba(0,0,0,.18)', transform: `rotate(${[-2.5, 1.8, -1.2, 2.4][i % 4]}deg)` }}><div style={{ ...imgBox(), boxShadow: 'none', border: 'none' }}><img src={p.thumbUrl} alt={p.caption ?? ''} loading="lazy" style={img(p, true)} /></div>{caption(p)}</figure>)}</div>;
  else if (layout.id === 'story') body = <div style={{ display: 'flex', flexDirection: 'column', gap: mini ? 4 : 36, maxWidth: 760, margin: '0 auto' }}>{photos.map((p) => <figure key={p.id} style={{ margin: 0 }}><div style={imgBox()}><img src={mini ? p.thumbUrl : p.fullUrl} alt={p.caption ?? ''} loading="lazy" style={img(p, false, true)} /></div>{caption(p)}</figure>)}</div>;
  else body = <div style={{ display: 'flex', gap, overflowX: 'auto', scrollSnapType: 'x mandatory', background: '#111', padding: mini ? '6px 3px' : '22px 14px', borderRadius: 8, backgroundImage: 'radial-gradient(circle, #444 3px, transparent 3.5px)', backgroundSize: mini ? '8px 100%' : '22px 100%', backgroundRepeat: 'repeat-x', backgroundPosition: '0 4px' }}>{photos.map((p) => <figure key={p.id} style={{ margin: 0, flex: `0 0 ${mini ? 46 : 78}%`, scrollSnapAlign: 'center' }}><div style={imgBox()}><img src={mini ? p.thumbUrl : p.fullUrl} alt={p.caption ?? ''} loading="lazy" style={img(p, false, true)} /></div>{p.caption && !mini ? <figcaption style={{ color: '#eee', fontFamily: theme.font, padding: '8px 2px 0' }}>{p.caption}</figcaption> : null}</figure>)}</div>;
  return (
    <div style={{ background: theme.bg, color: theme.ink, borderRadius: mini ? 8 : 20, padding: mini ? 6 : 'clamp(16px, 4vw, 40px)', overflow: 'hidden' }} data-design={d.number}>
      {!mini && (
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title style={{ fontFamily: theme.font, color: theme.ink, fontSize: 'clamp(30px, 6vw, 48px)', fontWeight: 700, margin: 0, lineHeight: 1.15 }}>{title}</Title>
          {subtitle && <p style={{ color: theme.accent, fontWeight: 700, marginTop: 8, letterSpacing: '.04em' }}>{subtitle}</p>}
        </header>
      )}
      {body}
    </div>
  );
}
