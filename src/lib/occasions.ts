import type { OccasionId } from './i18n';

export type OccasionGroup = 'personal' | 'festival-india' | 'festival-global' | 'life';

export interface OccasionDef {
  id: OccasionId;
  label: string;
  group: OccasionGroup;
  /** Short supporting line used on English cards. */
  sub: string;
  /** Palette family used by the card generator. */
  paletteSet: 'bright' | 'love' | 'festIN' | 'festGL' | 'soft' | 'calm';
  /** Personal occasions repeat on a date the user enters; festivals come from the calendar. */
  personal: boolean;
}

export const OCCASIONS: OccasionDef[] = [
  { id: 'birthday', label: 'Birthday', group: 'personal', sub: 'Wishing you a year full of joy', paletteSet: 'bright', personal: true },
  { id: 'anniversary', label: 'Anniversary', group: 'personal', sub: 'To many more years together', paletteSet: 'love', personal: true },
  { id: 'wedding', label: 'Wedding', group: 'personal', sub: 'on your wedding day', paletteSet: 'love', personal: true },
  { id: 'baby', label: 'New baby', group: 'personal', sub: 'Congratulations on your new arrival', paletteSet: 'soft', personal: true },
  { id: 'diwali', label: 'Diwali', group: 'festival-india', sub: 'May the lights bring joy and prosperity', paletteSet: 'festIN', personal: false },
  { id: 'holi', label: 'Holi', group: 'festival-india', sub: 'May your life be full of colour', paletteSet: 'bright', personal: false },
  { id: 'rakhi', label: 'Raksha Bandhan', group: 'festival-india', sub: 'For the bond that always protects', paletteSet: 'festIN', personal: false },
  { id: 'navratri', label: 'Navratri', group: 'festival-india', sub: 'Nine nights of joy and devotion', paletteSet: 'festIN', personal: false },
  { id: 'christmas', label: 'Christmas', group: 'festival-global', sub: 'Peace, warmth and good cheer', paletteSet: 'festGL', personal: false },
  { id: 'newyear', label: 'New Year', group: 'festival-global', sub: 'Here is to a bright year ahead', paletteSet: 'festGL', personal: false },
  { id: 'eid', label: 'Eid', group: 'festival-global', sub: 'Wishing you peace and blessings', paletteSet: 'festGL', personal: false },
  { id: 'easter', label: 'Easter', group: 'festival-global', sub: 'Spring blessings to you', paletteSet: 'soft', personal: false },
  { id: 'newjob', label: 'New job', group: 'life', sub: 'on your new job', paletteSet: 'bright', personal: true },
  { id: 'graduation', label: 'Graduation', group: 'life', sub: 'The future is yours', paletteSet: 'bright', personal: true },
  { id: 'getwell', label: 'Get well', group: 'life', sub: 'Sending healing thoughts your way', paletteSet: 'soft', personal: true },
  { id: 'condolence', label: 'Sympathy', group: 'life', sub: 'Thinking of you and your family', paletteSet: 'calm', personal: true },
];

const byId = new Map(OCCASIONS.map((o) => [o.id, o]));
export function getOccasion(id: string): OccasionDef {
  const o = byId.get(id as OccasionId);
  if (!o) throw new Error(`Unknown occasion: ${id}`);
  return o;
}
export function isOccasion(id: string): id is OccasionId {
  return byId.has(id as OccasionId);
}
