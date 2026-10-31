import { api } from './client';
import { API_URL } from '../config';

/** Turns a path from the API (for example /api/files/... or /art/...) into a full URL the app can load. */
export const absUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${API_URL}${path}`);

/* ---------------- Occasions (same ids and groups as the website) ---------------- */

export const OCCASION_LABELS: Record<string, string> = {
  birthday: 'Birthday', anniversary: 'Anniversary', wedding: 'Wedding', baby: 'New baby', diwali: 'Diwali', holi: 'Holi',
  rakhi: 'Raksha Bandhan', navratri: 'Navratri', christmas: 'Christmas', newyear: 'New Year', eid: 'Eid', easter: 'Easter',
  newjob: 'New job', graduation: 'Graduation', getwell: 'Get well', condolence: 'Sympathy', engagement: 'Engagement',
  babyshower: 'Baby shower', mothersday: 'Mother’s Day', fathersday: 'Father’s Day', grandparents: 'Grandparents',
  valentines: 'Valentine’s Day', housewarming: 'Housewarming', retirement: 'Retirement', promotion: 'Promotion',
  farewell: 'Farewell', teacher: 'Thank you, teacher', goodluck: 'Good luck', achievement: 'Well done', halloween: 'Halloween',
  hanukkah: 'Hanukkah', vaisakhi: 'Vaisakhi', vesak: 'Vesak', ramadan: 'Ramadan', thanksgiving: 'Thanksgiving',
  sankranti: 'Makar Sankranti / Pongal', pet: 'Pets', friendship: 'Friendship', thankyou: 'Thank you', remembrance: 'In loving memory',
};

export const OCCASION_GROUPS: { id: string; label: string; ids: string[] }[] = [
  { id: 'celebrate', label: 'Celebrate', ids: ['birthday', 'anniversary', 'wedding', 'engagement', 'baby', 'babyshower', 'housewarming', 'pet'] },
  { id: 'love', label: 'Love & family', ids: ['valentines', 'mothersday', 'fathersday', 'grandparents', 'friendship', 'thankyou', 'teacher'] },
  { id: 'life', label: 'Work & milestones', ids: ['newjob', 'promotion', 'graduation', 'goodluck', 'achievement', 'retirement', 'farewell'] },
  { id: 'festivals', label: 'Festivals', ids: ['diwali', 'holi', 'rakhi', 'navratri', 'sankranti', 'vaisakhi', 'eid', 'ramadan', 'christmas', 'newyear', 'easter', 'hanukkah', 'vesak', 'thanksgiving', 'halloween'] },
  { id: 'support', label: 'Support', ids: ['getwell', 'condolence', 'remembrance'] },
];

export const occasionLabel = (id: string) => OCCASION_LABELS[id] ?? id;

/* ---------------- Types (the JSON the API returns) ---------------- */

export type Visibility = 'public' | 'link' | 'invite';

/** The form values sent to POST /api/celebrations and PUT /api/celebrations/:id. */
export type CelebrationInput = {
  title: string; occasion: string; honoree: string; description: string; date: string; time: string; endTime: string; timezone: string;
  place: string; address: string; onlineUrl: string; designIndex: number; visibility: Visibility; rsvpEnabled: boolean; rsvpDeadline: string;
  askDiet: boolean; askAccess: boolean; maxPartySize: number; guestPosts: boolean; moderatePosts: boolean; showGuestList: boolean; wishlistId: string;
};

export type CelebrationRow = {
  id: string; slug: string; title: string; occasion: string; honoree: string | null; description: string | null;
  startsAt: string; endsAt: string | null; timezone: string; place: string | null; address: string | null; onlineUrl: string | null;
  designIndex: number; visibility: Visibility; rsvpEnabled: boolean; rsvpDeadline: string | null; askDiet: boolean; askAccess: boolean;
  maxPartySize: number; guestPosts: boolean; moderatePosts: boolean; showGuestList: boolean; wishlistId: string | null; cancelledAt: string | null;
};

export type CelebrationListItem = CelebrationRow & { guests: number; coming: number };

export type Guest = {
  id: string; name: string; email: string | null; phone: string | null; status: 'invited' | 'yes' | 'no' | 'maybe'; partySize: number;
  diet: string | null; access: string | null; note: string | null; invitedAt: string | null; token: string; selfAdded: boolean;
};

export type Post = {
  id: string; name: string; message: string; approved: boolean; kind: 'wish' | 'memory'; createdAt: string;
  media: { url: string; kind: 'image' | 'video' } | null;
};

export type Update = { id: string; body: string; createdAt: string; emailed: number };

export type Summary = {
  invited: number; yes: number; no: number; maybe: number; waiting: number; headcount: number;
  diets: { name: string; diet: string }[]; access: { name: string; access: string }[];
};

export type HostView = { celebration: CelebrationRow; guests: Guest[]; posts: Post[]; updates: Update[]; summary: Summary };

export type GuestInput = { name: string; email: string | null; phone: string | null };

/* ---------------- API calls ---------------- */

export const listCelebrations = () => api<{ celebrations: CelebrationListItem[] }>('/celebrations');

export const getCelebration = (id: string) => api<HostView>(`/celebrations/${id}`);

export const createCelebration = (input: CelebrationInput) => api<{ celebration: CelebrationRow }>('/celebrations', { body: input });

export const updateCelebration = (id: string, input: CelebrationInput) =>
  api<{ celebration: CelebrationRow }>(`/celebrations/${id}`, { method: 'PUT', body: input });

export const deleteCelebration = (id: string) => api<{ ok: boolean }>(`/celebrations/${id}`, { method: 'DELETE' });

export const addGuests = (id: string, guests: GuestInput[]) => api<{ guests: Guest[] }>(`/celebrations/${id}/guests`, { body: { guests } });

export const removeGuest = (id: string, guestId: string) => api<{ ok: boolean }>(`/celebrations/${id}/guests/${guestId}`, { method: 'DELETE' });

/** Emails invitations to guests not yet invited, or to the guests given. */
export const sendInvitations = (id: string, guestIds?: string[]) =>
  api<{ emailed: number }>(`/celebrations/${id}/invite`, { body: guestIds ? { guestIds } : {} });

export const moderatePost = (id: string, postId: string, action: 'approve' | 'delete') =>
  api<{ ok: boolean }>(`/celebrations/${id}/posts/${postId}`, { body: { action } });

export const postUpdate = (id: string, body: string) => api<{ update: Update }>(`/celebrations/${id}/updates`, { body: { body } });

export const sendThankYous = (id: string, message: string) => api<{ emailed: number }>(`/celebrations/${id}/thanks`, { body: { message } });

export const cancelCelebration = (id: string, message: string) =>
  api<{ celebration: CelebrationRow }>(`/celebrations/${id}/cancel`, { body: { message } });

/* ---------------- Helpers ---------------- */

/** Splits pasted lines like "Meena, meena@example.com" or "Gran +44 7700 900123" into guests. Same rules as the website. */
export function parseGuestLines(text: string): GuestInput[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((line) => {
    const email = line.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/)?.[0] ?? null;
    const phone = line.replace(email ?? '', '').match(/\+?\d[\d ()-]{5,18}\d/)?.[0]?.trim() ?? null;
    const name = line.replace(email ?? '', '').replace(phone ?? '', '').replace(/[<>,;]+/g, ' ').replace(/\s+/g, ' ').trim()
      || (email ? email.split('@')[0] : 'Guest');
    return { name: name.slice(0, 80), email, phone };
  });
}

/** A celebration is past once it has ended (or six hours after it starts, when no end time is set). */
export function isPast(c: { startsAt: string; endsAt: string | null }, now = Date.now()) {
  const end = c.endsAt ? new Date(c.endsAt).getTime() : new Date(c.startsAt).getTime() + 6 * 3600000;
  return now > end;
}

/** Date and 24-hour time of an instant, as seen in the celebration's own time zone. */
export function localParts(iso: string, tz: string): { date: string; time: string } {
  const d = new Date(iso);
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).map((x) => [x.type, x.value]),
    );
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
}

export function formatWhen(iso: string, tz: string) {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** The form values for an existing celebration (what the Details tab edits). */
export function formFromRow(c: CelebrationRow): CelebrationInput {
  const start = localParts(c.startsAt, c.timezone);
  return {
    title: c.title, occasion: c.occasion, honoree: c.honoree ?? '', description: c.description ?? '', date: start.date, time: start.time,
    endTime: c.endsAt ? localParts(c.endsAt, c.timezone).time : '', timezone: c.timezone, place: c.place ?? '', address: c.address ?? '',
    onlineUrl: c.onlineUrl ?? '', designIndex: c.designIndex, visibility: c.visibility, rsvpEnabled: c.rsvpEnabled,
    rsvpDeadline: c.rsvpDeadline ? localParts(c.rsvpDeadline, c.timezone).date : '', askDiet: c.askDiet, askAccess: c.askAccess,
    maxPartySize: c.maxPartySize, guestPosts: c.guestPosts, moderatePosts: c.moderatePosts, showGuestList: c.showGuestList,
    wishlistId: c.wishlistId ?? '',
  };
}

/** Defaults for a new celebration: two weeks out, 18:00, a random card design. */
export function emptyCelebration(timezone: string, occasion = 'birthday'): CelebrationInput {
  const d = new Date(Date.now() + 14 * 86400000);
  return {
    title: '', occasion, honoree: '', description: '', date: d.toISOString().slice(0, 10), time: '18:00', endTime: '', timezone,
    place: '', address: '', onlineUrl: '', designIndex: Math.floor(Math.random() * 50), visibility: 'link', rsvpEnabled: true, rsvpDeadline: '',
    askDiet: false, askAccess: false, maxPartySize: 1, guestPosts: true, moderatePosts: false, showGuestList: false, wishlistId: '',
  };
}

/** The card art for an occasion and design (250 designs, two art pictures per occasion). Same mapping as the website. */
export function designArt(occasion: string, index: number) {
  const i = ((Math.trunc(index) % 250) + 250) % 250;
  return `/art/${occasion}-${((Math.floor(i / 25) % 10) % 2) + 1}.jpg`;
}
