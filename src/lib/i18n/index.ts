import data from './languages.json';

export type OccasionId =
  | 'birthday' | 'anniversary' | 'wedding' | 'baby' | 'diwali' | 'holi' | 'rakhi' | 'navratri'
  | 'christmas' | 'newyear' | 'eid' | 'easter' | 'newjob' | 'graduation' | 'getwell' | 'condolence';

export interface Language {
  code: string;
  label: string;
  rtl: boolean;
  indian: boolean;
  greetings: Record<OccasionId, string>;
  dear: string; // pattern containing {n}
  festiveMessage: string;
  offer: string;
  sampleBirthdayWish: string;
  seoBirthday: string[]; // [mom, dad, friend, partner]
}

export const LANGUAGES: Language[] = data.languages as Language[];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function isLanguage(code: string): boolean {
  return byCode.has(code);
}

export function getLanguage(code: string): Language {
  const l = byCode.get(code);
  if (!l) throw new Error(`Unsupported language: ${code}`);
  return l;
}

export function greeting(occasion: OccasionId, lang: string): string {
  return getLanguage(lang).greetings[occasion];
}

export function addressName(lang: string, name: string): string {
  return getLanguage(lang).dear.replace('{n}', name);
}

export function direction(lang: string): 'rtl' | 'ltr' {
  return getLanguage(lang).rtl ? 'rtl' : 'ltr';
}

/** Font families needed to render a language's script (Google Fonts names). */
export function fontFor(lang: string): string | null {
  const map: Record<string, string> = {
    hi: 'Noto Sans Devanagari', mr: 'Noto Sans Devanagari', mai: 'Noto Sans Devanagari', ne: 'Noto Sans Devanagari', kok: 'Noto Sans Devanagari',
    bn: 'Noto Sans Bengali', as: 'Noto Sans Bengali', ta: 'Noto Sans Tamil', te: 'Noto Sans Telugu', gu: 'Noto Sans Gujarati',
    pa: 'Noto Sans Gurmukhi', kn: 'Noto Sans Kannada', or: 'Noto Sans Oriya', ml: 'Noto Sans Malayalam',
    ar: 'Noto Naskh Arabic', ur: 'Noto Naskh Arabic', fa: 'Noto Naskh Arabic', zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR',
  };
  return map[lang] ?? null;
}
