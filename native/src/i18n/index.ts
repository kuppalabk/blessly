import { getLocales } from 'expo-localization';
import { loadDictionary } from './dictionaries';

// Same rule as the website: the English text is the key. A missing translation shows English.
let dict: Record<string, string> = {};
let rtl = false;

export function setLanguage(code: string) {
  const base = code.split('-')[0];
  dict = loadDictionary(base);
  rtl = ['ar', 'ur', 'fa'].includes(base);
}

export function deviceLanguage(): string {
  return getLocales()[0]?.languageCode ?? 'en';
}

export function isRtl() {
  return rtl;
}

/** Translate an English string. Placeholders like {name} are filled from vars. */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = dict[text] || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
