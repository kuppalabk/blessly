import { LANGUAGES } from '../i18n-data';

/**
 * Interface translations. Keys are the English text, so a missing translation shows English.
 * Dictionaries live in src/locales/<code>.json. Placeholders look like {name}.
 * For counts, `tp` picks the English singular/plural key; dictionaries may add "<plural key>#few"/"#many"
 * entries for languages with more plural forms (Russian, Arabic…).
 */
export type Dict = Record<string, string>;
export type Vars = Record<string, string | number | null | undefined>;

export const UI_LANGUAGES: string[] = LANGUAGES.map((l) => l.code);
export const isRtl = (code: string) => !!LANGUAGES.find((l) => l.code === code)?.rtl;

/** BCP-47 tag for dates and numbers (Filipino, Odia, Konkani… map to tags Intl knows). */
export const intlLocale = (code: string) => ({ en: 'en-GB', zh: 'zh-CN', fil: 'fil-PH', pt: 'pt-BR', or: 'or-IN', as: 'as-IN', mai: 'mai-IN', kok: 'kok-IN', pa: 'pa-IN', ur: 'ur-PK' } as Record<string, string>)[code] ?? code;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s);

export function makeT(locale: string, dict: Dict | null) {
  const rules = (() => { try { return new Intl.PluralRules(intlLocale(locale)); } catch { return new Intl.PluralRules('en'); } })();
  const t = (s: string, vars?: Vars) => fill(dict?.[s] || s, vars);
  /** Count-aware: tp(n, '{n} person', '{n} people'). */
  const tp = (n: number, one: string, other: string, vars?: Vars) => {
    const cat = rules.select(n);
    const v = { n, ...vars };
    if (dict) {
      const special = dict[`${other}#${cat}`];
      if (special) return fill(special, v);
      if (cat === 'one') return fill(dict[one] || one, v);
      return fill(dict[other] || (n === 1 ? one : other), v);
    }
    return fill(n === 1 ? one : other, v);
  };
  return { t, tp, locale, dir: (isRtl(locale) ? 'rtl' : 'ltr') as 'rtl' | 'ltr', intl: intlLocale(locale) };
}
export type T = ReturnType<typeof makeT>;

/** Best supported language for an Accept-Language header. */
export function fromAcceptLanguage(header: string | null | undefined) {
  if (!header) return null;
  const wanted = header.split(',').map((p) => { const [tag, q] = p.trim().split(';q='); return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 }; }).sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split('-')[0];
    const code = base === 'tl' ? 'fil' : base === 'fa' || base === 'per' ? 'fa' : base;
    if (UI_LANGUAGES.includes(code)) return code;
  }
  return null;
}

/** Marks English defined outside components (label maps, tab names) for translation. Translate where shown: t(label). */
export const msg = <S extends string>(s: S) => s;

/** Country name in the interface language (Intl knows every region). */
export function regionName(code: string, locale: string) {
  try { return new Intl.DisplayNames([intlLocale(locale)], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
/** January…December in the interface language. */
export function monthNames(locale: string) {
  return Array.from({ length: 12 }, (_, i) => { try { return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 1))); } catch { return String(i + 1); } });
}
/** Mon…Sun (short) in the interface language, Monday first. */
export function weekdayNames(locale: string) {
  return Array.from({ length: 7 }, (_, i) => { try { return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))); } catch { return ''; } });
}
