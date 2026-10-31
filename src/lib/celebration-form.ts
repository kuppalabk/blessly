import type { OccasionId } from './i18n-data';

export type CelebrationInput = {
  title: string; occasion: OccasionId; honoree: string; description: string; date: string; time: string; endTime: string; timezone: string;
  place: string; address: string; onlineUrl: string; designIndex: number; visibility: 'public' | 'link' | 'invite'; rsvpEnabled: boolean; rsvpDeadline: string;
  askDiet: boolean; askAccess: boolean; maxPartySize: number; guestPosts: boolean; moderatePosts: boolean; showGuestList: boolean; wishlistId: string;
};

export function emptyCelebration(timezone: string, occasion: OccasionId = 'birthday'): CelebrationInput {
  const d = new Date(Date.now() + 14 * 86400000);
  return {
    title: '', occasion, honoree: '', description: '', date: d.toISOString().slice(0, 10), time: '18:00', endTime: '', timezone,
    place: '', address: '', onlineUrl: '', designIndex: Math.floor(Math.random() * 50), visibility: 'link', rsvpEnabled: true, rsvpDeadline: '',
    askDiet: false, askAccess: false, maxPartySize: 1, guestPosts: true, moderatePosts: false, showGuestList: false, wishlistId: ''
  };
}
