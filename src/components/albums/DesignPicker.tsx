'use client';
import { useState } from 'react';
import { ALBUM_THEMES, albumDesign } from '@/lib/albums';
import { AlbumView, type ViewPhoto } from './AlbumView';
import { useT } from '@/components/I18n';

const SAMPLE = ['cake', 'friends', 'beach', 'fireworks'].map((n, i) => ({ id: `s${i}`, thumbUrl: `/photos/photo-${n}.jpg`, fullUrl: `/photos/photo-${n}.jpg`, width: 4, height: i % 2 ? 5 : 3, caption: null }));

/** All 100 album designs, 20 per colour theme, each previewed with the album's own photos (or samples). */
export function DesignPicker({ value, onPick, photos }: { value: number; onPick: (i: number) => void; photos: ViewPhoto[] }) {
  const { t: tr } = useT();
  const [theme, setTheme] = useState(Math.floor(value / 20));
  const sample = (photos.length ? photos : SAMPLE).slice(0, 4);
  return (
    <div className="stack">
      <div className="row-wrap" role="group" aria-label={tr("Colour theme")}>
        {ALBUM_THEMES.map((t, i) => (
          <button key={t.id} type="button" className="chip" aria-pressed={theme === i} onClick={() => setTheme(i)}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: t.accent, marginRight: 6, verticalAlign: -1 }} />{t.name}
          </button>
        ))}
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {Array.from({ length: 20 }, (_, k) => theme * 20 + k).map((i) => {
          const d = albumDesign(i);
          return (
            <button key={i} type="button" className="wcard-btn" aria-pressed={value === i} aria-label={tr("Design {number}: {name}", { number: d.number, name: d.name })} onClick={() => onPick(i)}>
              <div style={{ height: 120, overflow: 'hidden', borderRadius: 8, pointerEvents: 'none' }}><AlbumView title="" designIndex={i} photos={sample} mini /></div>
              <span className="wcard-meta">{d.number}. {d.layout.name} · {d.frame.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
