'use client';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import { settingsStore } from '@/lib/settings';
import type { Delay, Mode } from '@/domain/model';
import { describeDelay } from '@/domain/delay';
import { isRtl, LOCALE_COOKIE, type Locale } from './locales';
import { MESSAGES, type MessageKey, type P } from './messages';

export type TFn = (key: MessageKey, params?: P) => string;

/** Překladová funkce: řetězce s {proměnnými}, množná čísla jako funkce. */
export function makeT(locale: Locale): TFn {
  const dict = MESSAGES[locale];
  return (key, params = {}) => {
    const m = dict[key] as string | ((p: P) => string);
    if (typeof m === 'function') return m(params);
    return m.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? String(params[k]) : all));
  };
}

const I18nCtx = createContext<{ locale: Locale; t: TFn }>({ locale: 'cs', t: makeT('cs') });

/** Jazyk: výslovná volba v nastavení, jinak automaticky podle prohlížeče (určeno na serveru, bez probliknutí). */
export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const pref = useStore(settingsStore, (s) => s.language);
  const locale: Locale = pref === 'auto' ? initial : pref;
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = locale;
    el.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }, [locale]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;

export function setLanguagePreference(pref: 'auto' | Locale) {
  settingsStore.set({ language: pref });
  try {
    document.cookie = pref === 'auto' ? `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax` : `${LOCALE_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
  } catch { /* cookies nedostupné */ }
}

export const modeName = (t: TFn, m: Mode) => t(`mode_${m}` as MessageKey);
export const modesName = (t: TFn, m: Mode) => t(`modes_${m}` as MessageKey);

/** Texty zpoždění – neznámá hodnota se nikdy nezobrazí jako „včas“. */
export function delayTexts(t: TFn, delay: Delay) {
  const d = describeDelay(delay);
  const n = delay.kind === 'known' ? Math.max(1, Math.round(Math.abs(delay.seconds) / 60)) : 0;
  if (d.tone === 'unknown') return { tone: d.tone, label: t('delay_unknown'), short: t('delayShort_unknown') };
  if (d.tone === 'ok') return { tone: d.tone, label: t('delay_onTime'), short: t('delayShort_onTime') };
  return d.tone === 'late' ? { tone: d.tone, label: t('delay_late', { n }), short: t('delayShort_late', { n }) } : { tone: d.tone, label: t('delay_early', { n }), short: t('delayShort_early', { n }) };
}
