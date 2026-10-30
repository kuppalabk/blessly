import { api } from './client';
import type { Address } from './money';

/** Occasions, in the order the website shows them (src/lib/i18n-data.ts and src/lib/occasion-groups.ts). */
export type OccasionId = string;
export const OCCASIONS: { id: OccasionId; label: string }[] = [
  { id: 'birthday', label: 'Birthday' }, { id: 'anniversary', label: 'Anniversary' }, { id: 'wedding', label: 'Wedding' }, { id: 'baby', label: 'New baby' },
  { id: 'diwali', label: 'Diwali' }, { id: 'holi', label: 'Holi' }, { id: 'rakhi', label: 'Raksha Bandhan' }, { id: 'navratri', label: 'Navratri' },
  { id: 'christmas', label: 'Christmas' }, { id: 'newyear', label: 'New Year' }, { id: 'eid', label: 'Eid' }, { id: 'easter', label: 'Easter' },
  { id: 'newjob', label: 'New job' }, { id: 'graduation', label: 'Graduation' }, { id: 'getwell', label: 'Get well' }, { id: 'condolence', label: 'Sympathy' },
  { id: 'engagement', label: 'Engagement' }, { id: 'babyshower', label: 'Baby shower' }, { id: 'mothersday', label: 'Mother’s Day' }, { id: 'fathersday', label: 'Father’s Day' },
  { id: 'grandparents', label: 'Grandparents' }, { id: 'valentines', label: 'Valentine’s Day' }, { id: 'housewarming', label: 'Housewarming' }, { id: 'retirement', label: 'Retirement' },
  { id: 'promotion', label: 'Promotion' }, { id: 'farewell', label: 'Farewell' }, { id: 'teacher', label: 'Thank you, teacher' }, { id: 'goodluck', label: 'Good luck' },
  { id: 'achievement', label: 'Well done' }, { id: 'halloween', label: 'Halloween' }, { id: 'hanukkah', label: 'Hanukkah' }, { id: 'vaisakhi', label: 'Vaisakhi' },
  { id: 'vesak', label: 'Vesak' }, { id: 'ramadan', label: 'Ramadan' }, { id: 'thanksgiving', label: 'Thanksgiving' }, { id: 'sankranti', label: 'Makar Sankranti / Pongal' },
  { id: 'pet', label: 'Pets' }, { id: 'friendship', label: 'Friendship' }, { id: 'thankyou', label: 'Thank you' }, { id: 'remembrance', label: 'In loving memory' }
];

export const OCCASION_GROUPS: { id: string; label: string; ids: OccasionId[] }[] = [
  { id: 'celebrate', label: 'Celebrate', ids: ['birthday', 'anniversary', 'wedding', 'engagement', 'baby', 'babyshower', 'housewarming', 'pet'] },
  { id: 'love', label: 'Love & family', ids: ['valentines', 'mothersday', 'fathersday', 'grandparents', 'friendship', 'thankyou', 'teacher'] },
  { id: 'life', label: 'Work & milestones', ids: ['newjob', 'promotion', 'graduation', 'goodluck', 'achievement', 'retirement', 'farewell'] },
  { id: 'festivals', label: 'Festivals', ids: ['diwali', 'holi', 'rakhi', 'navratri', 'sankranti', 'vaisakhi', 'eid', 'ramadan', 'christmas', 'newyear', 'easter', 'hanukkah', 'vesak', 'thanksgiving', 'halloween'] },
  { id: 'support', label: 'Support', ids: ['getwell', 'condolence', 'remembrance'] }
];

export const occasionLabel = (id: string) => OCCASIONS.find((o) => o.id === id)?.label ?? id;

/** A card in the list. frontUrl is the finished picture, present once the card was saved from the editor. */
export type CardSummary = {
  id: string; title: string; occasion: string; favourite: boolean; updatedAt: string; frontUrl: string | null;
};

/** One card with its finished pictures. Both pictures are needed before the card can be used for a wish or printed. */
export type CardDetail = {
  id: string; title: string; occasion: string; favourite: boolean; createdAt: string; updatedAt: string;
  frontUrl: string | null; insideUrl: string | null;
};

export const listCards = () => api<{ designs: CardSummary[] }>('/designs');

export const getCard = (id: string) => api<{ design: CardDetail }>(`/designs/${id}`);

export const createCard = (body: { occasion: string; designIndex: number; language: string; from?: string }) =>
  api<{ design: { id: string } }>('/designs', { method: 'POST', body });

export const updateCard = (id: string, body: { title?: string; favourite?: boolean }) =>
  api<{ design: unknown }>(`/designs/${id}`, { method: 'PUT', body });

export const duplicateCard = (id: string) => api<{ design: { id: string } }>(`/designs/${id}/duplicate`, { method: 'POST' });

export const deleteCard = (id: string) => api<{ ok: boolean }>(`/designs/${id}`, { method: 'DELETE' });

/** Orders printed and posted copies of a card. Returns the payment page to open. */
export const orderPrints = (id: string, body: { quantity: number; address: Address; currency: string }) =>
  api<{ paymentId: string; checkoutUrl: string }>(`/designs/${id}/print`, { method: 'POST', body });

/** The card editor is web-only for now. This is the website page for a card. */
export const DESIGN_EDITOR_PATH = (id: string) => `/designs/${id}`;
