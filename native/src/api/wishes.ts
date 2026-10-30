import { api } from './client';

export const TONES = ['heartfelt', 'funny', 'short', 'poetic'] as const;
export type Tone = (typeof TONES)[number];

export type Channel = 'email' | 'sms' | 'whatsapp' | 'telegram' | 'link';

/** Occasions and languages, same ids as the website (lib/i18n-data). Labels are English keys for t(). */
export const OCCASIONS: { id: string; label: string }[] = [
  { id: 'birthday', label: 'Birthday' }, { id: 'anniversary', label: 'Anniversary' }, { id: 'wedding', label: 'Wedding' },
  { id: 'baby', label: 'New baby' }, { id: 'diwali', label: 'Diwali' }, { id: 'holi', label: 'Holi' },
  { id: 'rakhi', label: 'Raksha Bandhan' }, { id: 'navratri', label: 'Navratri' }, { id: 'christmas', label: 'Christmas' },
  { id: 'newyear', label: 'New Year' }, { id: 'eid', label: 'Eid' }, { id: 'easter', label: 'Easter' },
  { id: 'newjob', label: 'New job' }, { id: 'graduation', label: 'Graduation' }, { id: 'getwell', label: 'Get well' },
  { id: 'condolence', label: 'Sympathy' }, { id: 'engagement', label: 'Engagement' }, { id: 'babyshower', label: 'Baby shower' },
  { id: 'mothersday', label: 'Mother’s Day' }, { id: 'fathersday', label: 'Father’s Day' }, { id: 'grandparents', label: 'Grandparents' },
  { id: 'valentines', label: 'Valentine’s Day' }, { id: 'housewarming', label: 'Housewarming' }, { id: 'retirement', label: 'Retirement' },
  { id: 'promotion', label: 'Promotion' }, { id: 'farewell', label: 'Farewell' }, { id: 'teacher', label: 'Thank you, teacher' },
  { id: 'goodluck', label: 'Good luck' }, { id: 'achievement', label: 'Well done' }, { id: 'halloween', label: 'Halloween' },
  { id: 'hanukkah', label: 'Hanukkah' }, { id: 'vaisakhi', label: 'Vaisakhi' }, { id: 'vesak', label: 'Vesak' },
  { id: 'ramadan', label: 'Ramadan' }, { id: 'thanksgiving', label: 'Thanksgiving' }, { id: 'sankranti', label: 'Makar Sankranti / Pongal' },
  { id: 'pet', label: 'Pets' }, { id: 'friendship', label: 'Friendship' }, { id: 'thankyou', label: 'Thank you' },
  { id: 'remembrance', label: 'In loving memory' },
];

export const LANGUAGES: { code: string; label: string; rtl: boolean }[] = [
  { code: 'en', label: 'English', rtl: false }, { code: 'zh', label: '中文 · Mandarin', rtl: false },
  { code: 'hi', label: 'हिन्दी · Hindi', rtl: false }, { code: 'es', label: 'Español', rtl: false },
  { code: 'fr', label: 'Français', rtl: false }, { code: 'ar', label: 'العربية · Arabic', rtl: true },
  { code: 'bn', label: 'বাংলা · Bengali', rtl: false }, { code: 'pt', label: 'Português', rtl: false },
  { code: 'ru', label: 'Русский', rtl: false }, { code: 'ur', label: 'اردو · Urdu', rtl: true },
  { code: 'id', label: 'Bahasa Indonesia', rtl: false }, { code: 'de', label: 'Deutsch', rtl: false },
  { code: 'ja', label: '日本語 · Japanese', rtl: false }, { code: 'mr', label: 'मराठी · Marathi', rtl: false },
  { code: 'te', label: 'తెలుగు · Telugu', rtl: false }, { code: 'tr', label: 'Türkçe', rtl: false },
  { code: 'ta', label: 'தமிழ் · Tamil', rtl: false }, { code: 'vi', label: 'Tiếng Việt', rtl: false },
  { code: 'ko', label: '한국어 · Korean', rtl: false }, { code: 'it', label: 'Italiano', rtl: false },
  { code: 'gu', label: 'ગુજરાતી · Gujarati', rtl: false }, { code: 'fa', label: 'فارسی · Persian', rtl: true },
  { code: 'pa', label: 'ਪੰਜਾਬੀ · Punjabi', rtl: false }, { code: 'sw', label: 'Kiswahili', rtl: false },
  { code: 'fil', label: 'Filipino', rtl: false }, { code: 'kn', label: 'ಕನ್ನಡ · Kannada', rtl: false },
  { code: 'or', label: 'ଓଡ଼ିଆ · Odia', rtl: false }, { code: 'ml', label: 'മലയാളം · Malayalam', rtl: false },
  { code: 'as', label: 'অসমীয়া · Assamese', rtl: false }, { code: 'mai', label: 'मैथिली · Maithili', rtl: false },
  { code: 'ne', label: 'नेपाली · Nepali', rtl: false }, { code: 'kok', label: 'कोंकणी · Konkani', rtl: false },
];

export type Wish = {
  id: string;
  personId: string | null;
  occasion: string;
  language: string;
  tone: string;
  text: string;
  designIndex: number;
  recipientName: string;
  senderName: string;
  cardDraftId: string | null;
  messageFileId: string | null;
  createdAt: string;
};

export type WishPage = { id: string; wishId: string; slug: string; views: number; allowSignatures: boolean };

export type Send = { id: string; channel: Channel; recipient: string; sendAt: string; status: string };

export type WishDetail = {
  wish: Wish;
  page: WishPage | null;
  person: { id: string; name: string; phone: string | null; email: string | null; language: string } | null;
  sends: Send[];
};

export type DraftInput = {
  occasion: string;
  language: string;
  tone: Tone;
  recipientName: string;
  relationship?: string;
  senderName?: string;
  detail?: string;
  variant?: number;
};

export type SaveWishInput = {
  personId: string | null;
  occasion: string;
  language: string;
  tone: Tone;
  text: string;
  designIndex: number;
  recipientName: string;
  senderName: string;
  cardDraftId: string | null;
  messageFileId: null;
};

export const draftWish = (body: DraftInput) =>
  api<{ draft: { text: string; tone: Tone; source: 'ai' | 'template' } }>('/wishes/draft', { body });

export const saveWish = (body: SaveWishInput) => api<{ wish: Wish }>('/wishes', { body });

export const getWish = (id: string) => api<WishDetail>(`/wishes/${id}`);

/** Creates the shareable wish page (idempotent). Returns the public URL. */
export const publishWishPage = (id: string) => api<{ page: WishPage; url: string }>(`/wishes/${id}/page`, { method: 'POST', body: {} });

export const scheduleSend = (wishId: string, channel: Channel, recipient: string, sendAt: Date) =>
  api<{ send: Send }>(`/wishes/${wishId}/sends`, { body: { channel, recipient, sendAt: sendAt.toISOString() } });

export const cancelSend = (sendId: string) => api<{ send: Send }>(`/sends/${sendId}`, { method: 'DELETE' });

/* Send links. Personal WhatsApp, Telegram and SMS accounts cannot be automated, so these open the user's own app with the message filled in. */

const COUNTRY_CODES: Record<string, { code: string; nationalLength: number }> = {
  IN: { code: '91', nationalLength: 10 },
  GB: { code: '44', nationalLength: 10 },
  US: { code: '1', nationalLength: 10 },
  AE: { code: '971', nationalLength: 9 },
};

/** Normalises a phone number to international digits (no +). Returns null when it cannot be valid. */
export function normalizePhone(raw: string | null | undefined, country = 'IN'): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    const cc = COUNTRY_CODES[country];
    if (cc) {
      const national = digits.replace(/^0+/, '');
      if (national.length === cc.nationalLength) digits = cc.code + national;
    }
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const shareMessage = (text: string, pageUrl: string | null) => (pageUrl ? `${text}\n\n${pageUrl}` : text);
export const whatsappLink = (text: string, phone?: string | null) => `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
export const telegramLink = (text: string, url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
export const smsLink = (text: string, phone?: string | null) => `sms:${phone ? '+' + phone : ''}?&body=${encodeURIComponent(text)}`;
export const mailtoLink = (text: string, subject: string, email?: string | null) =>
  `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
export const facebookLink = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export const linkedinLink = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
export const xLink = (text: string, url: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(text.length > 200 ? `${text.slice(0, 197)}…` : text)}&url=${encodeURIComponent(url)}`;
