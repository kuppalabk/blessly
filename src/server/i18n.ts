import { cookies, headers } from 'next/headers';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currentUser } from './http';
import { fromAcceptLanguage, makeT, UI_LANGUAGES, type Dict } from '@/lib/i18n/ui';

export const LANG_COOKIE = 'ww_lang';
const cache = new Map<string, Dict | null>();

/** Loads src/locales/<code>.json (bundled with the server; cached). */
export function dictionary(code: string): Dict | null {
  if (code === 'en' || !UI_LANGUAGES.includes(code)) return null;
  if (!cache.has(code)) {
    try { cache.set(code, JSON.parse(readFileSync(path.join(process.cwd(), 'src', 'locales', `${code}.json`), 'utf8')) as Dict); }
    catch { cache.set(code, null); }
  }
  return cache.get(code)!;
}

/** The interface language: the signed-in person's setting, else the language picker cookie, else the browser. */
export async function getLocale(): Promise<string> {
  const u = await currentUser().catch(() => null);
  if (u?.language && UI_LANGUAGES.includes(u.language)) return u.language;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c && UI_LANGUAGES.includes(c)) return c;
  return fromAcceptLanguage((await headers()).get('accept-language')) ?? 'en';
}

export async function getT() {
  const locale = await getLocale();
  return makeT(locale, dictionary(locale));
}

const patterns = new Map<string, { re: RegExp; names: string[]; out: string }[]>();
/** Translates a server message: exact match, or a dictionary key with {placeholders} (e.g. "Only {n} left"). */
export function translateMessage(locale: string, message: string): string {
  const dict = dictionary(locale);
  if (!dict || !message) return message;
  if (dict[message]) return dict[message];
  if (!patterns.has(locale)) {
    patterns.set(locale, Object.entries(dict).filter(([k]) => /\{\w+\}/.test(k) && !k.includes('#')).map(([k, out]) => {
      const names: string[] = [];
      const re = new RegExp('^' + k.split(/(\{\w+\})/).map((part) => { const m = /^\{(\w+)\}$/.exec(part); if (m) { names.push(m[1]); return '(.+?)'; } return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('') + '$');
      return { re, names, out };
    }));
  }
  for (const p of patterns.get(locale)!) {
    const m = p.re.exec(message);
    if (m) return p.out.replace(/\{(\w+)\}/g, (all, name: string) => { const i = p.names.indexOf(name); return i >= 0 ? m[i + 1] : all; });
  }
  return message;
}
