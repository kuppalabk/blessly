import { z } from 'zod';
import { OCCASIONS, type OccasionId } from './i18n-data';
import { cardDesign } from './cards';

/**
 * A card made in the editor. Positions are fractions of the card (x, y = centre; 0..1),
 * sizes are fractions of the card width, so a card looks the same at any size and in print.
 * The card is 3:4 (portrait), like the designs.
 */

export const FONTS = [
  { id: 'bricolage', label: 'Bricolage', css: "'Bricolage Grotesque', sans-serif" },
  { id: 'dmsans', label: 'DM Sans', css: "'DM Sans', sans-serif" },
  { id: 'playfair', label: 'Playfair', css: "'Playfair Display', serif" },
  { id: 'caveat', label: 'Caveat (handwritten)', css: "'Caveat', cursive" },
  { id: 'dancing', label: 'Dancing Script', css: "'Dancing Script', cursive" },
  { id: 'pacifico', label: 'Pacifico', css: "'Pacifico', cursive" },
  { id: 'abril', label: 'Abril Fatface', css: "'Abril Fatface', serif" },
  { id: 'yatra', label: 'Yatra One', css: "'Yatra One', serif" }
] as const;
export type FontId = (typeof FONTS)[number]['id'];
export const fontCss = (id: string, script?: string) => `${(FONTS.find((f) => f.id === id) ?? FONTS[0]).css.split(',')[0]}, ${script ? `'${script}', ` : ''}sans-serif`;

export const STICKERS = ['🎂', '🎉', '🎈', '🎁', '🥳', '🍰', '🧁', '🕯️', '❤️', '💖', '💕', '🌹', '🌸', '🌻', '🌷', '💐', '⭐', '🌟', '✨', '🌙', '☀️', '🌈', '🦋', '🐶', '🐱', '🐾', '🏆', '🎓', '💼', '🏡', '🔑', '✈️', '🍀', '🎄', '🎅', '🪔', '🎆', '🎇', '🕌', '🕎', '🪷', '🪁', '🌾', '🎃', '🦃', '👶', '🍼', '💍', '🥂', '🍾', '🙏', '🤗', '😊', '😂', '😍', '👏', '💪', '🫶', '📸', '🎵'];

const id = z.string().regex(/^[a-z0-9]{4,24}$/i);
const frac = z.number().min(-0.5).max(1.5);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const base = { id, x: frac, y: frac, w: z.number().min(0.02).max(2), rot: z.number().min(-360).max(360).default(0) };

export const layerSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('text'), text: z.string().max(600), font: z.string().max(20), size: z.number().min(0.01).max(0.4), color, align: z.enum(['left', 'center', 'right']).default('center'), weight: z.union([z.literal(400), z.literal(700)]).default(700), italic: z.boolean().default(false), shadow: z.boolean().default(false) }),
  z.object({ ...base, type: z.literal('image'), fileId: z.string().uuid(), ratio: z.number().min(0.05).max(20), radius: z.number().min(0).max(0.5).default(0), border: z.boolean().default(false) }),
  z.object({ ...base, type: z.literal('sticker'), emoji: z.string().min(1).max(16) }),
  z.object({ ...base, type: z.literal('drawing'), path: z.string().max(60_000).regex(/^[MLQ0-9.\s,-]*$/), ratio: z.number().min(0.05).max(20), color, stroke: z.number().min(0.2).max(10) }),
  z.object({ ...base, type: z.literal('qr'), url: z.string().url().max(500).refine((u) => /^https?:\/\//.test(u), 'Use a web link'), color, bg: color })
]);
export type Layer = z.infer<typeof layerSchema>;

export const backgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('design'), occasion: z.enum(OCCASIONS.map((o) => o.id) as [OccasionId, ...OccasionId[]]), index: z.number().int().min(0).max(249) }),
  z.object({ kind: z.literal('color'), color, color2: color.nullable().default(null) }),
  z.object({ kind: z.literal('photo'), fileId: z.string().uuid(), zoom: z.number().min(1).max(4).default(1), ox: z.number().min(-1).max(1).default(0), oy: z.number().min(-1).max(1).default(0) })
]);
export type Background = z.infer<typeof backgroundSchema>;

export const pageSchema = z.object({ background: backgroundSchema, layers: z.array(layerSchema).max(60) });
export type Page = z.infer<typeof pageSchema>;

export const docSchema = z.object({ v: z.literal(1), pages: z.array(pageSchema).length(2), language: z.string().max(5).default('en') });
export type CardDoc = z.infer<typeof docSchema>;

export const newId = () => Math.random().toString(36).slice(2, 12).padEnd(6, '0');

/** The starting card for a design: its artwork as background, the greeting and name as editable text, and a blank inside page. */
export function initialDoc(o: { occasion: OccasionId; designIndex: number; greeting: string; to?: string; message?: string; from?: string; language?: string }): CardDoc {
  const d = cardDesign(o.occasion, o.designIndex);
  const solid = d.layout === 'Ribbon' || d.layout === 'Footer';
  const ink = solid ? d.palette.ink : d.art.dark ? '#ffffff' : '#1e1b2e';
  const y = d.layout === 'Footer' ? 0.83 : d.layout === 'Ribbon' ? 0.55 : 0.56;
  const font = ({ Bold: 'bricolage', Elegant: 'playfair', Handwritten: 'caveat', Festive: 'yatra', Minimal: 'dmsans' } as Record<string, FontId>)[d.typeStyle.name] ?? 'bricolage';
  const front: Layer[] = [
    { type: 'text', id: newId(), x: 0.5, y, w: 0.8, rot: 0, text: o.greeting, font, size: o.greeting.length > 20 ? 0.075 : 0.1, color: ink, align: 'center', weight: 700, italic: false, shadow: !solid }
  ];
  if (o.to) front.unshift({ type: 'text', id: newId(), x: 0.5, y: y - (d.layout === 'Footer' ? 0.09 : 0.1), w: 0.8, rot: 0, text: o.to, font: 'dmsans', size: 0.05, color: ink, align: 'center', weight: 700, italic: false, shadow: !solid });
  const inside: Layer[] = [
    { type: 'text', id: newId(), x: 0.5, y: 0.42, w: 0.78, rot: 0, text: o.message ?? '', font: 'caveat', size: 0.065, color: '#2b2640', align: 'center', weight: 700, italic: false, shadow: false },
    { type: 'text', id: newId(), x: 0.5, y: 0.78, w: 0.7, rot: 0, text: o.from ? `With love, ${o.from}` : 'With love', font: 'caveat', size: 0.06, color: d.palette.accent.toLowerCase(), align: 'center', weight: 700, italic: false, shadow: false }
  ];
  return {
    v: 1, language: o.language ?? 'en',
    pages: [
      { background: { kind: 'design', occasion: o.occasion, index: d.index }, layers: front },
      { background: { kind: 'color', color: '#fffdf8', color2: null }, layers: inside }
    ]
  };
}

/** File ids a document refers to (to check ownership and sign links). */
export function fileIdsIn(doc: CardDoc) {
  const ids = new Set<string>();
  for (const p of doc.pages) {
    if (p.background.kind === 'photo') ids.add(p.background.fileId);
    for (const l of p.layers) if (l.type === 'image') ids.add(l.fileId);
  }
  return [...ids];
}
