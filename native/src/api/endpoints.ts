import { api } from './client';

export type User = { id: string; name: string; email: string; timezone: string; country?: string; language?: string };

export type UpcomingItem = { id: string; kind: string; title: string; date: string; daysAway: number };

export type Person = { id: string; name: string; relationship?: string | null; birthday?: string | null };

export const login = (email: string, password: string) =>
  api<{ user?: User; mfa?: boolean }>('/auth/login', { method: 'POST', body: { email, password } });

export const logout = () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' });

export const me = () => api<{ user: User }>('/me');

export const upcoming = () => api<{ items: UpcomingItem[] }>('/upcoming');

export const people = () => api<{ people: Person[] }>('/people');
