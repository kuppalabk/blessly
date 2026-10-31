import { OCCASIONS, type OccasionId } from './i18n-data';

/** How occasions are grouped in pickers. Every occasion appears in exactly one group. */
export const OCCASION_GROUPS: { id: string; label: string; ids: OccasionId[] }[] = [
  { id: 'celebrate', label: 'Celebrate', ids: ['birthday', 'anniversary', 'wedding', 'engagement', 'baby', 'babyshower', 'housewarming', 'pet'] },
  { id: 'love', label: 'Love & family', ids: ['valentines', 'mothersday', 'fathersday', 'grandparents', 'friendship', 'thankyou', 'teacher'] },
  { id: 'life', label: 'Work & milestones', ids: ['newjob', 'promotion', 'graduation', 'goodluck', 'achievement', 'retirement', 'farewell'] },
  { id: 'festivals', label: 'Festivals', ids: ['diwali', 'holi', 'rakhi', 'navratri', 'sankranti', 'vaisakhi', 'eid', 'ramadan', 'christmas', 'newyear', 'easter', 'hanukkah', 'vesak', 'thanksgiving', 'halloween'] },
  { id: 'support', label: 'Support', ids: ['getwell', 'condolence', 'remembrance'] }
];

export const occasionLabel = (id: string) => OCCASIONS.find((o) => o.id === id)?.label ?? id;
export const groupOf = (id: string) => OCCASION_GROUPS.find((g) => g.ids.includes(id as OccasionId))?.id ?? 'celebrate';
