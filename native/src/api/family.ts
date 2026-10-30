import { Linking } from 'react-native';
import { router } from 'expo-router';
import { API_URL } from '../config';
import { api } from './client';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type RsvpStatus = 'going' | 'maybe' | 'no';
export type TaskStatus = 'todo' | 'doing' | 'done';

/** Same English labels as the website; translate them with t() where they are shown. */
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Can view' };

export type Family = { id: string; name: string; createdBy: string; createdAt: string };

/** One circle in GET /api/families. */
export type FamilySummary = Family & { role: Role; memberCount: number; limit: number };

export type Member = { userId: string; role: Role; notify: boolean; joinedAt: string; name: string; email: string | null };

export type FamilyEventRow = {
  id: string;
  familyId: string;
  title: string;
  occasion: string;
  eventDate: string;
  eventTime: string | null;
  place: string | null;
  notes: string | null;
  personId: string | null;
  wishId: string | null;
  createdBy: string | null;
  createdAt: string;
};

/** An event in the circle's list, with RSVP counts and the caller's own answer. */
export type FamilyEvent = FamilyEventRow & { rsvp: { going: number; maybe: number; no: number }; myRsvp: RsvpStatus | null };

export type Task = {
  id: string;
  familyId: string;
  eventId: string | null;
  title: string;
  assigneeId: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdBy: string | null;
  createdAt: string;
  assigneeName: string | null;
};

export type SharedPerson = { id: string; name: string; relationship: string; ownerId: string; ownerName: string | null };

export type Invite = { id: string; familyId: string; token: string; role: Role; createdBy: string; expiresAt: string; uses: number; revokedAt: string | null; createdAt: string };

/** GET /api/families/[id] */
export type FamilyView = {
  family: Family;
  me: { id: string; familyId: string; userId: string; role: Role; notify: boolean; joinedAt: string; canEdit: boolean; canManage: boolean };
  members: Member[];
  events: FamilyEvent[];
  tasks: Task[];
  shared: SharedPerson[];
  invites: Invite[];
  limit: number;
  seatsLeft: number;
};

/** GET /api/events/[id] */
export type EventView = {
  event: FamilyEventRow;
  family: Family;
  person: { id: string; name: string } | null;
  me: { role: Role; canEdit: boolean; canChange: boolean; rsvp: RsvpStatus | null };
  daysAway: number;
  members: { userId: string; name: string; role: Role; rsvp: RsvpStatus | null }[];
  tasks: Task[];
  card: { wishId: string; slug: string; signedBy: string[]; signatureCount: number; ownedByMe: boolean } | null;
};

export type EventInput = {
  title: string;
  occasion: string;
  eventDate: string;
  eventTime: string | null;
  place: string | null;
  notes: string | null;
  personId: string | null;
};

export type TaskInput = { title: string; assigneeId: string | null; dueDate: string | null; eventId: string | null };

export type InvitePreview = {
  familyId: string;
  familyName: string;
  inviter: string;
  role: Role;
  memberCount: number;
  status: 'ok' | 'expired' | 'revoked' | 'full' | 'member';
};

/** Occasions for family events, grouped the same way as the website picker. */
export const EVENT_OCCASION_GROUPS: { label: string; ids: { id: string; label: string }[] }[] = [
  { label: 'Celebrate', ids: [{ id: 'birthday', label: 'Birthday' }, { id: 'anniversary', label: 'Anniversary' }, { id: 'wedding', label: 'Wedding' }, { id: 'engagement', label: 'Engagement' }, { id: 'baby', label: 'New baby' }, { id: 'babyshower', label: 'Baby shower' }, { id: 'housewarming', label: 'Housewarming' }, { id: 'pet', label: 'Pets' }] },
  { label: 'Love & family', ids: [{ id: 'valentines', label: 'Valentine’s Day' }, { id: 'mothersday', label: 'Mother’s Day' }, { id: 'fathersday', label: 'Father’s Day' }, { id: 'grandparents', label: 'Grandparents' }, { id: 'friendship', label: 'Friendship' }, { id: 'thankyou', label: 'Thank you' }, { id: 'teacher', label: 'Thank you, teacher' }] },
  { label: 'Work & milestones', ids: [{ id: 'newjob', label: 'New job' }, { id: 'promotion', label: 'Promotion' }, { id: 'graduation', label: 'Graduation' }, { id: 'goodluck', label: 'Good luck' }, { id: 'achievement', label: 'Well done' }, { id: 'retirement', label: 'Retirement' }, { id: 'farewell', label: 'Farewell' }] },
  { label: 'Festivals', ids: [{ id: 'diwali', label: 'Diwali' }, { id: 'holi', label: 'Holi' }, { id: 'rakhi', label: 'Raksha Bandhan' }, { id: 'navratri', label: 'Navratri' }, { id: 'sankranti', label: 'Makar Sankranti / Pongal' }, { id: 'vaisakhi', label: 'Vaisakhi' }, { id: 'eid', label: 'Eid' }, { id: 'ramadan', label: 'Ramadan' }, { id: 'christmas', label: 'Christmas' }, { id: 'newyear', label: 'New Year' }, { id: 'easter', label: 'Easter' }, { id: 'hanukkah', label: 'Hanukkah' }, { id: 'vesak', label: 'Vesak' }, { id: 'thanksgiving', label: 'Thanksgiving' }, { id: 'halloween', label: 'Halloween' }] },
  { label: 'Support', ids: [{ id: 'getwell', label: 'Get well' }, { id: 'condolence', label: 'Sympathy' }, { id: 'remembrance', label: 'In loving memory' }] },
];

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

/**
 * Opens a link from the website. Family, join, calendar and alerts screens open in the app;
 * the home tab is the tabs root; everything else (people, cards, wishes, plans) opens in the browser.
 */
export function openLink(href: string) {
  if (href === '/home') {
    router.replace('/(tabs)');
    return;
  }
  if (['/family', '/join', '/calendar', '/notifications'].some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))) {
    router.push(href);
    return;
  }
  Linking.openURL(`${API_URL}${href.startsWith('/') ? '' : '/'}${href}`).catch(() => {});
}

/* ---------------- Circles ---------------- */

export const listFamilies = () => api<{ families: FamilySummary[] }>('/families');
export const createFamily = (name: string) => api<{ family: Family }>('/families', { method: 'POST', body: { name } });
export const getFamily = (id: string) => api<FamilyView>(`/families/${id}`);

/* ---------------- Members ---------------- */

export const updateMember = (familyId: string, userId: string, body: { role?: Role; notify?: boolean }) =>
  api<{ member: unknown }>(`/families/${familyId}/members/${userId}`, { method: 'PATCH', body });
/** Removes someone, or leaves when userId is your own. Deletes the circle when the last owner leaves. */
export const removeMember = (familyId: string, userId: string) =>
  api<{ deletedFamily: boolean }>(`/families/${familyId}/members/${userId}`, { method: 'DELETE' });

/* ---------------- Invites ---------------- */

export const createInvite = (familyId: string, role: 'admin' | 'member' | 'viewer') =>
  api<{ invite: { id: string; token: string; role: Role; expiresAt: string } }>(`/families/${familyId}/invites`, { method: 'POST', body: { role } });
export const revokeInvite = (familyId: string, inviteId: string) =>
  api<{ ok: boolean }>(`/families/${familyId}/invites/${inviteId}`, { method: 'DELETE' });
export const previewInvite = (token: string) => api<InvitePreview>(`/invites/${token}`);
export const acceptInvite = (token: string) => api<{ familyId: string; joined: boolean }>(`/invites/${token}`, { method: 'POST' });

/* ---------------- Tasks ---------------- */

export const createTask = (familyId: string, input: TaskInput) => api<{ task: Task }>(`/families/${familyId}/tasks`, { method: 'POST', body: input });
export const updateTask = (taskId: string, body: { status?: TaskStatus; assigneeId?: string | null }) =>
  api<{ task: Task }>(`/tasks/${taskId}`, { method: 'PATCH', body });
export const deleteTask = (taskId: string) => api<{ ok: boolean }>(`/tasks/${taskId}`, { method: 'DELETE' });

/* ---------------- Events ---------------- */

export const createEvent = (familyId: string, input: EventInput) => api<{ event: { id: string } }>(`/families/${familyId}/events`, { method: 'POST', body: input });
export const getEvent = (id: string) => api<EventView>(`/events/${id}`);
export const updateEvent = (id: string, input: EventInput) => api<{ event: { id: string } }>(`/events/${id}`, { method: 'PUT', body: input });
export const deleteEvent = (id: string) => api<{ familyId: string }>(`/events/${id}`, { method: 'DELETE' });
export const setRsvp = (id: string, status: RsvpStatus) => api<{ status: RsvpStatus }>(`/events/${id}/rsvp`, { method: 'POST', body: { status } });
/** Starts the group card. Returns the existing card if one already exists. */
export const startGroupCard = (id: string) => api<{ slug: string; wishId: string }>(`/events/${id}/card`, { method: 'POST' });
