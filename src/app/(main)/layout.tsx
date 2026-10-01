import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { serverEnv } from '@/server/env';
import { I18nProvider } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** Mapa je ve sdíleném layoutu – při přechodu mezi obrazovkami se nevytváří znovu. */
export default async function MainLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  return <I18nProvider initial={locale}><AppShell styleUrl={serverEnv.mapStyleUrl} demo={serverEnv.demo}>{children}</AppShell></I18nProvider>;
}
