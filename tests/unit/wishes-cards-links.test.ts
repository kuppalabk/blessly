import { describe, expect, it, vi } from 'vitest';
import { templateWish, TONES } from '@/lib/wishes/templates';
import { generateWish, AnthropicWishProvider } from '@/lib/wishes/generate';
import { LANGUAGES, OCCASIONS, GREETINGS } from '@/lib/i18n-data';
import { cardDesign, DESIGNS_PER_OCCASION } from '@/lib/cards';
import { normalizePhone, whatsappLink, telegramLink, smsLink, facebookLink, linkedinLink, xLink } from '@/lib/send-links';
import fs from 'node:fs';
import path from 'node:path';

describe('wish templates', () => {
  it('has a greeting for every occasion in all 32 languages', () => {
    expect(LANGUAGES).toHaveLength(32);
    for (const o of OCCASIONS) for (const l of LANGUAGES) expect(GREETINGS[o.id][l.code], `${o.id}/${l.code}`).toBeTruthy();
  });

  it('writes a wish for every occasion, language and tone', () => {
    for (const o of OCCASIONS) for (const l of LANGUAGES) for (const tone of TONES) {
      const w = templateWish({ occasion: o.id, language: l.code, tone, recipientName: 'Nisha' });
      expect(w.text.length, `${o.id}/${l.code}/${tone}`).toBeGreaterThan(5);
      expect(w.text).not.toContain('{');
    }
  });

  it('includes the name, detail and sender in English', () => {
    const w = templateWish({ occasion: 'birthday', language: 'en', tone: 'heartfelt', recipientName: 'Nisha', detail: 'our Goa trip', senderName: 'Kiran' });
    expect(w.text).toContain('Nisha');
    expect(w.text).toContain('our Goa trip');
    expect(w.text.endsWith('— Kiran')).toBe(true);
  });

  it('uses the right comma for Arabic-script and East Asian languages', () => {
    expect(templateWish({ occasion: 'eid', language: 'ar', tone: 'short', recipientName: 'Fatima' }).text).toBe('عيد مبارك، Fatima!');
    expect(templateWish({ occasion: 'birthday', language: 'zh', tone: 'short', recipientName: '小明' }).text).toBe('生日快乐，小明！');
  });

  it('never writes celebration copy for sympathy messages', () => {
    const w = templateWish({ occasion: 'condolence', language: 'en', tone: 'funny', recipientName: 'Ravi' });
    expect(w.text).toMatch(/sorry for your loss/);
  });

  it('strips line breaks and limits length of user-supplied names', () => {
    const w = templateWish({ occasion: 'birthday', language: 'en', tone: 'short', recipientName: 'A\nB' + 'x'.repeat(200) });
    expect(w.text).not.toMatch(/A\nB/);
    expect(w.text.length).toBeLessThan(140);
  });
});

describe('wish generation with AI provider', () => {
  it('uses the AI text when the provider succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: 'जन्मदिन मुबारक, निशा!' }] }), { status: 200 }));
    const p = new AnthropicWishProvider('key', 'model-x', fetchMock as unknown as typeof fetch);
    const r = await generateWish({ occasion: 'birthday', language: 'hi', tone: 'funny', recipientName: 'Nisha' }, p);
    expect(r).toEqual({ text: 'जन्मदिन मुबारक, निशा!', tone: 'funny', source: 'ai' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('model-x');
    expect(body.messages[0].content).toContain('Hindi');
  });

  it('falls back to templates when the provider fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('busy', { status: 529 }));
    const p = new AnthropicWishProvider('key', 'm', fetchMock as unknown as typeof fetch);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await generateWish({ occasion: 'diwali', language: 'ta', tone: 'heartfelt', recipientName: 'Anil' }, p);
    expect(r.source).toBe('template');
    expect(r.text).toContain(GREETINGS.diwali.ta);
    warn.mockRestore();
  });
});

describe('card designs', () => {
  it('produces 250 distinct designs per occasion', () => {
    for (const o of OCCASIONS) {
      const names = new Set(Array.from({ length: DESIGNS_PER_OCCASION }, (_, i) => cardDesign(o.id, i).name + cardDesign(o.id, i).art.src));
      expect(names.size).toBe(250);
    }
  });

  it('wraps out-of-range indexes and points at artwork that exists', () => {
    expect(cardDesign('diwali', 250).index).toBe(0);
    expect(cardDesign('diwali', -1).index).toBe(249);
    for (const o of OCCASIONS) for (const i of [0, 25]) {
      const src = cardDesign(o.id, i).art.src;
      expect(fs.existsSync(path.join('public', src)), src).toBe(true);
    }
  });
});

describe('send links', () => {
  it('normalises phone numbers for the default country', () => {
    expect(normalizePhone('98765 43210', 'IN')).toBe('919876543210');
    expect(normalizePhone('07700 900123', 'GB')).toBe('447700900123');
    expect(normalizePhone('+1 (415) 555-0100', 'IN')).toBe('14155550100');
    expect(normalizePhone('0044 7700 900123', 'IN')).toBe('447700900123');
    expect(normalizePhone('123', 'IN')).toBeNull();
    expect(normalizePhone('', 'IN')).toBeNull();
  });

  it('builds encoded deep links', () => {
    expect(whatsappLink('Hi & bye', '919876543210')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
    expect(whatsappLink('Hi')).toBe('https://wa.me/?text=Hi');
    expect(telegramLink('Hi', 'https://x.y/w/abc')).toBe('https://t.me/share/url?url=https%3A%2F%2Fx.y%2Fw%2Fabc&text=Hi');
    expect(smsLink('Hi', '447700900123')).toBe('sms:+447700900123?&body=Hi');
  });

  it('builds social share links that carry the wish page', () => {
    const url = 'https://x.y/w/abc';
    expect(facebookLink(url)).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fx.y%2Fw%2Fabc');
    expect(linkedinLink(url)).toBe('https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.y%2Fw%2Fabc');
    expect(xLink('Happy birthday & more', url)).toBe('https://x.com/intent/post?text=Happy%20birthday%20%26%20more&url=https%3A%2F%2Fx.y%2Fw%2Fabc');
    expect(decodeURIComponent(xLink('a'.repeat(300), url).split('text=')[1].split('&')[0])).toHaveLength(198);
  });
});
