import { OCCASIONS, PALETTES, type OccasionId } from './i18n-data';

export const DESIGNS_PER_OCCASION = 250;
export const LAYOUTS = ['Open', 'Ribbon', 'Glass', 'Footer', 'Frame'] as const;
export type Layout = (typeof LAYOUTS)[number];

export const TYPE_STYLES = [
  { name: 'Bold', font: "'Bricolage Grotesque', sans-serif", weight: 700, size: 21, upper: false },
  { name: 'Elegant', font: "'Playfair Display', serif", weight: 700, size: 20, upper: false },
  { name: 'Handwritten', font: "'Caveat', cursive", weight: 700, size: 28, upper: false },
  { name: 'Festive', font: "'Yatra One', serif", weight: 400, size: 21, upper: false },
  { name: 'Minimal', font: "'DM Sans', sans-serif", weight: 700, size: 14, upper: true }
] as const;

/** Which artworks have dark backgrounds (light text on top). Index 0 = art 1, 1 = art 2. */
const DARK_ART: Record<OccasionId, [boolean, boolean]> = {
  birthday: [false, true], anniversary: [true, false], wedding: [false, true], baby: [false, false],
  diwali: [true, true], holi: [false, false], rakhi: [false, true], navratri: [true, true],
  christmas: [true, true], newyear: [true, true], eid: [true, true], easter: [false, false],
  newjob: [true, true], graduation: [true, true], getwell: [false, false], condolence: [true, false],
  engagement: [false, true], babyshower: [false, false], mothersday: [false, true], fathersday: [false, true],
  grandparents: [false, true], valentines: [false, true], housewarming: [false, true], retirement: [false, true],
  promotion: [false, true], farewell: [false, true], teacher: [false, true], goodluck: [false, true],
  achievement: [false, true], halloween: [true, true], hanukkah: [true, false], vaisakhi: [false, false],
  vesak: [true, false], ramadan: [true, true], thanksgiving: [false, true], sankranti: [false, false],
  pet: [false, true], friendship: [false, true], thankyou: [false, true], remembrance: [true, false]
};

export type CardDesign = {
  occasion: OccasionId;
  index: number;
  number: number;
  layout: Layout;
  typeStyle: (typeof TYPE_STYLES)[number];
  palette: { bg: string; band: string; ink: string; accent: string };
  art: { src: string; dark: boolean };
  name: string;
};

export function isOccasion(x: string): x is OccasionId {
  return OCCASIONS.some((o) => o.id === x);
}

/** Every design is a deterministic combination: 5 layouts × 5 type styles × 10 palettes, with art alternating by palette. */
export function cardDesign(occasion: OccasionId, index: number): CardDesign {
  const i = ((Math.trunc(index) % DESIGNS_PER_OCCASION) + DESIGNS_PER_OCCASION) % DESIGNS_PER_OCCASION;
  const L = i % 5, T = Math.floor(i / 5) % 5, P = Math.floor(i / 25) % 10;
  const set = OCCASIONS.find((o) => o.id === occasion)!.paletteSet;
  const [bg, band, ink, accent] = PALETTES[set][P];
  const artIdx = P % 2;
  return {
    occasion, index: i, number: i + 1,
    layout: LAYOUTS[L], typeStyle: TYPE_STYLES[T],
    palette: { bg, band, ink, accent },
    art: { src: `/art/${occasion}-${artIdx + 1}.jpg`, dark: DARK_ART[occasion][artIdx] },
    name: `${LAYOUTS[L]} · ${TYPE_STYLES[T].name} · Palette ${P + 1}`
  };
}

export type CardOverrides = { hidden: number[]; featured: number[] };

/** Design order shown to users: featured first, then the rest; hidden designs are left out. */
export function designOrder(o?: CardOverrides) {
  const hidden = new Set(o?.hidden ?? []);
  const featured = (o?.featured ?? []).filter((i) => !hidden.has(i) && i >= 0 && i < DESIGNS_PER_OCCASION);
  const fset = new Set(featured);
  return [...featured, ...Array.from({ length: DESIGNS_PER_OCCASION }, (_, i) => i).filter((i) => !hidden.has(i) && !fset.has(i))];
}
