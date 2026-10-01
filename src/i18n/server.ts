import { cookies, headers } from 'next/headers';
import { isLocale, LOCALE_COOKIE, negotiate, type Locale } from './locales';

/** Jazyk pro serverové vykreslení: uložená volba (cookie), jinak Accept-Language. */
export async function resolveLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return negotiate((await headers()).get('accept-language'));
}
