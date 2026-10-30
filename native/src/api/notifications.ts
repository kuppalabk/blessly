import { api } from './client';

/** One alert from GET /api/notifications. Dates arrive as ISO strings. */
export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  pushedAt: string | null;
  createdAt: string;
};

/** The server returns the latest 30 alerts. */
export const listNotifications = () => api<{ notifications: Notification[]; unread: number }>('/notifications');

export const markAllRead = () => api<{ ok: boolean }>('/notifications', { method: 'POST', body: { all: true } });
