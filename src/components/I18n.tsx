'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { makeT, type Dict } from '@/lib/i18n/ui';

const Ctx = createContext<{ locale: string; dict: Dict | null }>({ locale: 'en', dict: null });

export function I18nProvider({ locale, dict, children }: { locale: string; dict: Dict | null; children: ReactNode }) {
  const v = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useT() {
  const { locale, dict } = useContext(Ctx);
  return useMemo(() => makeT(locale, dict), [locale, dict]);
}
