import * as WebBrowser from 'expo-web-browser';
import { API_URL } from '../config';
import { api } from './client';
import type { User } from './endpoints';

export type { User };

/** Languages offered in Settings. Same list as the website (src/lib/i18n-data.ts). */
export const LANGUAGES: { code: string; label: string; rtl: boolean }[] = [
  { code: 'en', label: 'English', rtl: false }, { code: 'zh', label: '中文 · Mandarin', rtl: false }, { code: 'hi', label: 'हिन्दी · Hindi', rtl: false },
  { code: 'es', label: 'Español', rtl: false }, { code: 'fr', label: 'Français', rtl: false }, { code: 'ar', label: 'العربية · Arabic', rtl: true },
  { code: 'bn', label: 'বাংলা · Bengali', rtl: false }, { code: 'pt', label: 'Português', rtl: false }, { code: 'ru', label: 'Русский', rtl: false },
  { code: 'ur', label: 'اردو · Urdu', rtl: true }, { code: 'id', label: 'Bahasa Indonesia', rtl: false }, { code: 'de', label: 'Deutsch', rtl: false },
  { code: 'ja', label: '日本語 · Japanese', rtl: false }, { code: 'mr', label: 'मराठी · Marathi', rtl: false }, { code: 'te', label: 'తెలుగు · Telugu', rtl: false },
  { code: 'tr', label: 'Türkçe', rtl: false }, { code: 'ta', label: 'தமிழ் · Tamil', rtl: false }, { code: 'vi', label: 'Tiếng Việt', rtl: false },
  { code: 'ko', label: '한국어 · Korean', rtl: false }, { code: 'it', label: 'Italiano', rtl: false }, { code: 'gu', label: 'ગુજરાતી · Gujarati', rtl: false },
  { code: 'fa', label: 'فارسی · Persian', rtl: true }, { code: 'pa', label: 'ਪੰਜਾਬੀ · Punjabi', rtl: false }, { code: 'sw', label: 'Kiswahili', rtl: false },
  { code: 'fil', label: 'Filipino', rtl: false }, { code: 'kn', label: 'ಕನ್ನಡ · Kannada', rtl: false }, { code: 'or', label: 'ଓଡ଼ିଆ · Odia', rtl: false },
  { code: 'ml', label: 'മലയാളം · Malayalam', rtl: false }, { code: 'as', label: 'অসমীয়া · Assamese', rtl: false }, { code: 'mai', label: 'मैथिली · Maithili', rtl: false },
  { code: 'ne', label: 'नेपाली · Nepali', rtl: false }, { code: 'kok', label: 'कोंकणी · Konkani', rtl: false }
];

/** Countries offered for the festival calendar. "XX" means Other. */
export const COUNTRIES: { code: string; label: string }[] = [
  { code: 'IN', label: 'India' }, { code: 'GB', label: 'United Kingdom' }, { code: 'US', label: 'United States' },
  { code: 'AE', label: 'United Arab Emirates' }, { code: 'XX', label: 'Other' }
];

/** Time zones the device knows about, falling back to the user's own. */
export function timezoneOptions(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  return all.includes(current) ? all : [current, ...all];
}

/* ---------------- Web pages ---------------- */

/** Turns a path like "/plans" or a link returned by the server into a full address. */
export function webUrl(pathOrUrl: string) {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** Opens a website page in the in-app browser. Used where a flow is web-only (editor, payment pages, uploads). */
export async function openWebPage(pathOrUrl: string) {
  await WebBrowser.openBrowserAsync(webUrl(pathOrUrl));
}

/* ---------------- Account ---------------- */

export type SignInOptions = {
  hasPassword: boolean;
  phone: string | null;
  mfa: boolean;
  recoveryCodesLeft: number;
  identities: { provider: 'google' | 'apple'; email: string | null }[];
  sessions: number;
};

export const signInOptions = () => api<SignInOptions>('/me/security');

export const updateMe = (body: Partial<Pick<User, 'name' | 'timezone' | 'country' | 'language'>>) =>
  api<{ user: User }>('/me', { method: 'PATCH', body });

/** Permanently deletes the account. The server checks the password and the typed word DELETE. */
export const deleteMe = (password: string) =>
  api<{ ok: boolean }>('/me', { method: 'DELETE', body: { password, confirm: 'DELETE' } });

/** Everything Blessly stores about the user, as JSON (same data as the website download). */
export const exportMyData = () => api<Record<string, unknown>>('/me/export');

export const removeSessionsElsewhere = () => api<{ ok: boolean }>('/me/security', { method: 'DELETE' });

/* ---------------- Two-step verification ---------------- */

export type TwoStepSetup = { secret: string; uri: string; qr: string };

export const twoStepSetup = () => api<TwoStepSetup>('/me/2fa', { method: 'POST', body: { action: 'setup' } });
export const twoStepConfirm = (code: string) => api<{ recoveryCodes: string[] }>('/me/2fa', { method: 'POST', body: { action: 'confirm', code } });
export const twoStepNewCodes = (code: string) => api<{ recoveryCodes: string[] }>('/me/2fa', { method: 'POST', body: { action: 'recovery', code } });
export const twoStepOff = (code: string) => api<{ ok: boolean }>('/me/2fa', { method: 'POST', body: { action: 'disable', code } });

/* ---------------- Password, sign-in options, phone ---------------- */

export const setPassword = (current: string, next: string) =>
  api<{ ok: boolean }>('/me/password', { method: 'POST', body: { current, next } });

export const unlinkIdentity = (provider: 'google' | 'apple') =>
  api<{ ok: boolean }>(`/me/identities/${provider}`, { method: 'DELETE' });

export const startPhoneChange = (phone: string) =>
  api<{ token: string; phone: string; devCode?: string }>('/me/phone', { method: 'POST', body: { phone } });

export const confirmPhoneChange = (token: string, code: string) =>
  api<{ phone: string }>('/me/phone', { method: 'POST', body: { token, code } });

export const removePhone = () => api<{ ok: boolean }>('/me/phone', { method: 'DELETE' });

/* ---------------- Plans ---------------- */

export type Plan = {
  id: string; name: string;
  inrMonthly: number; inrYearly: number; usdMonthly: number; usdYearly: number;
  maxFamilyMembers: number; maxAlbums: number; maxPhotosPerAlbum: number;
  businessMessages: number; businessSeats: number;
};

/**
 * The plans and the signed-in user's current plan. Signed-out visitors get the plans only.
 * Needs a GET /api/plans route on the server (the website reads this on the server side today).
 */
export type PlansView = {
  plans: Plan[];
  currentPlan?: string;
  cancelAtPeriodEnd: boolean;
  pastDue: boolean;
  periodEnd: string | null;
};

export const getPlans = () => api<PlansView>('/plans');

/** Returns the payment page to open. Paid access starts when the provider confirms. */
export const startPlanCheckout = (planId: 'family' | 'business', interval: 'month' | 'year', currency: 'INR' | 'USD') =>
  api<{ url: string }>('/billing/checkout', { method: 'POST', body: { planId, interval, currency } });

export const cancelPlan = () =>
  api<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }>('/billing/cancel', { method: 'POST' });
