/**
 * 100 album designs = 5 page layouts × 4 photo frames × 5 colour themes.
 * Index i → layout = i % 5, frame = floor(i / 5) % 4, theme = floor(i / 20).
 */
export const ALBUM_DESIGNS = 100;

export const ALBUM_LAYOUTS = [
  { id: 'grid', name: 'Grid' },
  { id: 'masonry', name: 'Collage' },
  { id: 'polaroid', name: 'Polaroid' },
  { id: 'story', name: 'Story' },
  { id: 'film', name: 'Filmstrip' }
] as const;

export const ALBUM_FRAMES = [
  { id: 'clean', name: 'Clean', radius: 6, border: 'none', shadow: 'none', pad: 0 },
  { id: 'rounded', name: 'Rounded', radius: 18, border: 'none', shadow: '0 6px 18px rgba(0,0,0,.18)', pad: 0 },
  { id: 'mat', name: 'Matted', radius: 4, border: '1px solid rgba(0,0,0,.08)', shadow: '0 2px 6px rgba(0,0,0,.12)', pad: 10 },
  { id: 'gold', name: 'Gilded', radius: 2, border: '3px solid #C9A227', shadow: '0 4px 12px rgba(0,0,0,.2)', pad: 4 }
] as const;

export const ALBUM_THEMES = [
  { id: 'ivory', name: 'Ivory', bg: '#FBF7F0', panel: '#FFFFFF', ink: '#2B2620', accent: '#B5651D', font: "'Playfair Display', serif" },
  { id: 'saffron', name: 'Saffron', bg: '#FFF1DC', panel: '#FFFFFF', ink: '#4A2A05', accent: '#E07A1F', font: "'Yatra One', serif" },
  { id: 'midnight', name: 'Midnight', bg: '#15142A', panel: '#221F3D', ink: '#F4F1FF', accent: '#C9A227', font: "'Playfair Display', serif" },
  { id: 'blush', name: 'Blush', bg: '#FCEEF1', panel: '#FFFFFF', ink: '#4B2030', accent: '#D0577B', font: "'Caveat', cursive" },
  { id: 'meadow', name: 'Meadow', bg: '#EEF6EE', panel: '#FFFFFF', ink: '#1F3B2A', accent: '#2F8F5B', font: "'Bricolage Grotesque', sans-serif" }
] as const;

export type AlbumDesign = {
  index: number;
  number: number;
  name: string;
  layout: (typeof ALBUM_LAYOUTS)[number];
  frame: (typeof ALBUM_FRAMES)[number];
  theme: (typeof ALBUM_THEMES)[number];
};

export function albumDesign(index: number): AlbumDesign {
  const i = ((Math.trunc(index) % ALBUM_DESIGNS) + ALBUM_DESIGNS) % ALBUM_DESIGNS;
  const layout = ALBUM_LAYOUTS[i % 5], frame = ALBUM_FRAMES[Math.floor(i / 5) % 4], theme = ALBUM_THEMES[Math.floor(i / 20)];
  return { index: i, number: i + 1, name: `${layout.name} · ${frame.name} · ${theme.name}`, layout, frame, theme };
}

/** A sensible starting design per occasion (users can pick any of the 100). */
export function defaultAlbumDesign(occasion: string) {
  const theme = ({ diwali: 1, holi: 1, navratri: 1, rakhi: 1, eid: 2, christmas: 2, newyear: 2, anniversary: 3, wedding: 3, baby: 3, birthday: 0 } as Record<string, number>)[occasion] ?? 4;
  return theme * 20 + 2; // Polaroid · Clean
}
