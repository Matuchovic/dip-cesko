import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { serverEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Mapa je ve sdíleném layoutu – při přechodu mezi obrazovkami se nevytváří znovu. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return <AppShell styleUrl={serverEnv.mapStyleUrl} demo={serverEnv.demo}>{children}</AppShell>;
}
