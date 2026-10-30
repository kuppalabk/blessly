import { api, ApiError } from './client';
import { API_URL } from '../config';

/* ---------------- Multipart uploads ---------------- */

/** A photo picked from the device library (expo-image-picker asset). */
export type PickedImage = { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };

/**
 * api() only sends JSON, so photo uploads post a multipart form the same way the website does.
 * The session cookie and error shape match api().
 */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json', 'x-client': 'native' },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof data.code === 'string' ? data.code : 'error', message);
  }
  return data as T;
}

/** Builds a multipart form with one picked image under the given field name. */
export function imageForm(field: string, image: PickedImage) {
  const form = new FormData();
  const file = { uri: image.uri, name: image.fileName || 'photo.jpg', type: image.mimeType || 'image/jpeg' };
  form.append(field, file as unknown as Blob);
  return form;
}

/* ---------------- Designs (100 = 5 layouts x 4 frames x 5 colour themes) ---------------- */

export const ALBUM_DESIGNS = 100;
const LAYOUTS = ['Grid', 'Collage', 'Polaroid', 'Story', 'Filmstrip'];
const FRAMES = ['Clean', 'Rounded', 'Matted', 'Gilded'];
export const ALBUM_THEMES = [
  { name: 'Ivory', bg: '#FBF7F0', accent: '#B5651D', ink: '#2B2620' },
  { name: 'Saffron', bg: '#FFF1DC', accent: '#E07A1F', ink: '#4A2A05' },
  { name: 'Midnight', bg: '#15142A', accent: '#C9A227', ink: '#F4F1FF' },
  { name: 'Blush', bg: '#FCEEF1', accent: '#D0577B', ink: '#4B2030' },
  { name: 'Meadow', bg: '#EEF6EE', accent: '#2F8F5B', ink: '#1F3B2A' },
];

/** Index i gives layout i % 5, frame floor(i / 5) % 4, theme floor(i / 20). Same as the website. */
export function albumDesign(index: number) {
  const i = ((Math.trunc(index) % ALBUM_DESIGNS) + ALBUM_DESIGNS) % ALBUM_DESIGNS;
  const layout = LAYOUTS[i % 5], frame = FRAMES[Math.floor(i / 5) % 4], theme = ALBUM_THEMES[Math.floor(i / 20)];
  return { index: i, number: i + 1, name: `${layout} · ${frame} · ${theme.name}`, theme };
}

/* ---------------- Types ---------------- */

export type AlbumRow = {
  id: string; userId: string; title: string; occasion: string; designIndex: number; slug: string | null; guestUploads: boolean;
  familyId: string | null; coverPhotoId: string | null; createdAt: string;
};

export type AlbumListItem = AlbumRow & {
  ownerName: string; familyName: string | null; isMine: boolean; photoCount: number; coverUrl: string | null;
};

export type AlbumPhoto = {
  id: string; albumId: string; caption: string | null; thumbUrl: string; fullUrl: string; width: number | null; height: number | null;
  uploader: string; uploadedBy: string | null; sortOrder: number;
};

export type AlbumDetail = {
  album: AlbumRow; isOwner: boolean; canView: boolean; canAdd: boolean; photos: AlbumPhoto[]; maxPhotos: number;
};

export type FamilyChoice = { id: string; name: string; role: 'owner' | 'admin' | 'member' | 'viewer' };

/* ---------------- API calls ---------------- */

export const listAlbums = () => api<{ albums: AlbumListItem[] }>('/albums');

export const getAlbum = (id: string) => api<AlbumDetail>(`/albums/${id}`);

export const createAlbum = (input: { title: string; occasion: string; familyId: string }) =>
  api<{ album: AlbumRow }>('/albums', { body: { ...input, familyId: input.familyId || null } });

/** Owner-only changes: title, occasion, family, design, sharing, guest uploads, cover photo. */
export const updateAlbum = (id: string, patch: Record<string, unknown>) =>
  api<{ album: AlbumRow }>(`/albums/${id}`, { method: 'PATCH', body: patch });

export const deleteAlbum = (id: string) => api<{ ok: boolean }>(`/albums/${id}`, { method: 'DELETE' });

export const updatePhotoCaption = (photoId: string, caption: string) =>
  api<{ photo: AlbumPhoto }>(`/photos/${photoId}`, { method: 'PATCH', body: { caption } });

export const deletePhoto = (photoId: string) => api<{ ok: boolean }>(`/photos/${photoId}`, { method: 'DELETE' });

export const uploadAlbumPhoto = (albumId: string, image: PickedImage) =>
  postForm<{ photo: AlbumPhoto }>(`/albums/${albumId}/photos`, imageForm('photo', image));

/** Families where the person can add things (not viewers). Used for the "Share with family" choice. */
export const listEditableFamilies = () =>
  api<{ families: FamilyChoice[] }>('/families').then((r) => ({ families: r.families.filter((f) => f.role !== 'viewer') }));
