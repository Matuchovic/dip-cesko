import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/plus-jakarta-sans/latin-ext-500.css';
import '@fontsource/plus-jakarta-sans/latin-ext-600.css';
import '@fontsource/plus-jakarta-sans/latin-ext-700.css';
import '@fontsource/plus-jakarta-sans/latin-ext-800.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@/styles/globals.css';
import { isRtl } from '@/i18n/locales';
import { resolveLocale } from '@/i18n/server';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: { default: 'DopravaČR – najdi si spoj, kdykoliv, kdekoliv', template: '%s · DopravaČR' },
  description: 'Odjezdy, spojení a živá mapa veřejné dopravy v reálném čase. První integrace: Pražská integrovaná doprava.',
  applicationName: 'DopravaČR',
  appleWebApp: { capable: true, title: 'DopravaČR', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icons/favicon-32.png', type: 'image/png', sizes: '32x32' }, { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#EEEAE2' }, { media: '(prefers-color-scheme: dark)', color: '#0B1424' }],
};

const themeInit = `try{var s=JSON.parse(localStorage.getItem('doprava.settings.v1')||'{}');var t=s.theme||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>{children}</body>
    </html>
  );
}
