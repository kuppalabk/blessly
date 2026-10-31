import { api } from './client';
import { imageForm, postForm, type PickedImage } from './albums';

export type WishlistRow = {
  id: string; title: string; description: string | null; occasion: string; eventDate: string | null; surprise: boolean;
  shippingNote: string | null; slug: string; revealedAt: string | null; updatedAt: string;
};

export type WishlistListItem = WishlistRow & { items: number };

export type Priority = 1 | 2 | 3;

/** One item as the API returns it. The price is already formatted for display. */
export type WishItemBase = {
  id: string; title: string; url: string | null; price: string | null; priceMinor: number | null; currency: string | null;
  notes: string | null; priority: Priority; quantity: number; imageUrl: string | null;
};

export type Reservation = { id: string; name: string; quantity: number; purchased: boolean; thanked: boolean; hasEmail: boolean };

/** The owner's view of one item. `taken` and `reservations` are empty or null while the list is a surprise. */
export type WishItem = WishItemBase & { taken: number | null; reservations: Reservation[] };

export type WishlistDetail = { wishlist: WishlistRow; hidden: boolean; items: WishItem[]; reservedCount: number };

export type ItemInput = {
  title: string; url: string; price: string; currency: string; notes: string; priority: Priority; quantity: number;
};

export const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED'] as const;

/** The default currency for a new item, from the person's country. Same as the website. */
export function defaultCurrency(country?: string) {
  return ({ IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED' } as Record<string, string>)[country ?? ''] ?? 'EUR';
}

export const listWishlists = () => api<{ wishlists: WishlistListItem[] }>('/wishlists');

export const getWishlist = (id: string) => api<WishlistDetail>(`/wishlists/${id}`);

export const createWishlist = (input: { title: string; occasion: string; eventDate: string }) =>
  api<{ wishlist: WishlistRow }>('/wishlists', { body: input });

/** Partial update, for example { surprise: false } or { title }. */
export const updateWishlist = (id: string, patch: Partial<{ title: string; description: string; occasion: string; eventDate: string; surprise: boolean; shippingNote: string }>) =>
  api<{ wishlist: WishlistRow }>(`/wishlists/${id}`, { method: 'PUT', body: patch });

export const deleteWishlist = (id: string) => api<{ ok: boolean }>(`/wishlists/${id}`, { method: 'DELETE' });

/** Shows the reservations of a surprise list to its owner. */
export const revealWishlist = (id: string) => api<{ ok: boolean }>(`/wishlists/${id}/reveal`, { method: 'POST' });

export const thankGivers = (id: string, message: string) => api<{ emailed: number }>(`/wishlists/${id}/thanks`, { body: { message } });

export const addItem = (id: string, input: ItemInput) => api<{ item: WishItemBase }>(`/wishlists/${id}/items`, { body: input });

export const updateItem = (id: string, itemId: string, input: Partial<ItemInput>) =>
  api<{ item: WishItemBase }>(`/wishlists/${id}/items/${itemId}`, { method: 'PUT', body: input });

export const moveItem = (id: string, itemId: string, move: 'up' | 'down') =>
  api<{ ok: boolean }>(`/wishlists/${id}/items/${itemId}`, { method: 'PUT', body: { move } });

export const deleteItem = (id: string, itemId: string) => api<{ ok: boolean }>(`/wishlists/${id}/items/${itemId}`, { method: 'DELETE' });

/** Uploads a photo for an item (multipart, field "photo"). Returns the new image URL. */
export const uploadItemPhoto = (id: string, itemId: string, image: PickedImage) =>
  postForm<{ imageUrl: string }>(`/wishlists/${id}/items/${itemId}/photo`, imageForm('photo', image));
