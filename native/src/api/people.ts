import { api } from './client';

export type OccasionKind = 'birthday' | 'anniversary' | 'work_anniversary' | 'custom';
export type CalDate = { y: number; m: number; d: number };

export type OccasionView = {
  id: string;
  kind: OccasionKind;
  label: string;
  month: number;
  day: number;
  remindGift: boolean;
  remindIdeas: boolean;
  remindDraft: boolean;
  remindDay: boolean;
  next: CalDate;
  daysAway: number;
};

/** Same shape the website's /api/people routes return (PersonView). */
export type PersonView = {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  language: string;
  notes: string | null;
  familyId: string | null;
  occasions: OccasionView[];
  nextOccasion: OccasionView | null;
  isMine: boolean;
  ownerName: string | null;
};

export type OccasionInput = {
  kind: OccasionKind;
  label: string | null;
  month: number;
  day: number;
  remindGift: boolean;
  remindIdeas: boolean;
  remindDraft: boolean;
  remindDay: boolean;
};

export type PersonInput = {
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  language: string;
  notes: string | null;
  occasions: OccasionInput[];
  familyId: string | null;
};

export type FamilyOption = { id: string; name: string; role: string };

export const RELATIONSHIPS = ['Mother', 'Father', 'Partner', 'Wife', 'Husband', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandparent', 'Friend', 'Best friend', 'Colleague', 'Other'];

export const OCCASION_KINDS: { id: OccasionKind; label: string }[] = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'work_anniversary', label: 'Work anniversary' },
  { id: 'custom', label: 'Other' },
];

/** Family circles the user can add people to. Viewers cannot. */
export const canEditFamily = (role: string) => role !== 'viewer';

export const listPeople = () => api<{ people: PersonView[] }>('/people');
export const getPerson = (id: string) => api<{ person: PersonView }>(`/people/${id}`);
export const createPerson = (input: PersonInput) => api<{ person: PersonView }>('/people', { body: input });
export const updatePerson = (id: string, input: PersonInput) => api<{ person: PersonView }>(`/people/${id}`, { method: 'PUT', body: input });
export const deletePerson = (id: string) => api<{ ok: boolean }>(`/people/${id}`, { method: 'DELETE' });
export const listFamilies = () => api<{ families: FamilyOption[] }>('/families');

export function addDaysCal(c: CalDate, n: number): CalDate {
  const x = new Date(c.y, c.m - 1, c.d + n);
  return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() };
}

export function formatCalDate(c: CalDate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(c.y, c.m - 1, c.d).toLocaleDateString(undefined, opts);
}
