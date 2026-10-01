export const LOCALES = ['cs', 'en', 'de', 'ar', 'es', 'it', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'cs';
export const LOCALE_COOKIE = 'lang';
export const LOCALE_NAMES: Record<Locale, string> = { cs: 'Čeština', en: 'English', de: 'Deutsch', ar: 'العربية', es: 'Español', it: 'Italiano', uk: 'Українська' };
export const isRtl = (l: Locale) => l === 'ar';
export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (LOCALES as readonly string[]).includes(x);

/** Automatický výběr jazyka podle preferencí prohlížeče (Accept-Language / navigator.languages). */
export function negotiate(prefs: readonly string[] | string | null | undefined): Locale {
  const list = typeof prefs === 'string' ? prefs.split(',').map((p) => p.split(';')[0]?.trim() ?? '') : prefs ?? [];
  for (const p of list) {
    const base = p.toLowerCase().split('-')[0] ?? '';
    if (isLocale(base)) return base;
    if (base === 'sk') return 'cs';
  }
  return DEFAULT_LOCALE;
}
