/**
 * "One tap" send links. Personal WhatsApp/Telegram/SMS accounts cannot be automated,
 * so these open the user's own app with the message pre-filled; the user taps send.
 */
const COUNTRY_CODES: Record<string, { code: string; nationalLength: number }> = {
  IN: { code: '91', nationalLength: 10 },
  GB: { code: '44', nationalLength: 10 },
  US: { code: '1', nationalLength: 10 },
  AE: { code: '971', nationalLength: 9 }
};

/** Normalise a phone number to international digits (no +). Returns null if it can't be a valid number. */
export function normalizePhone(raw: string | null | undefined, defaultCountry = 'IN'): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    const cc = COUNTRY_CODES[defaultCountry];
    if (cc) {
      const national = digits.replace(/^0+/, '');
      if (national.length === cc.nationalLength) digits = cc.code + national;
    }
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(text: string, phone?: string | null) {
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
}

export function telegramLink(text: string, url: string) {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function smsLink(text: string, phone?: string | null) {
  return `sms:${phone ? '+' + phone : ''}?&body=${encodeURIComponent(text)}`;
}

export function mailtoLink(text: string, subject: string, email?: string | null) {
  return `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export function shareMessage(wishText: string, pageUrl: string | null) {
  return pageUrl ? `${wishText}\n\n${pageUrl}` : wishText;
}

/* Social networks only accept a link (they show the wish page preview card); none allow posting for the user. */

export function facebookLink(url: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function linkedinLink(url: string) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export function xLink(text: string, url: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text.length > 200 ? `${text.slice(0, 197)}…` : text)}&url=${encodeURIComponent(url)}`;
}
