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

export const metadata: Metadata = {
  title: { default: 'Doprava — Celé Česko', template: '%s · Doprava' },
  description: 'Odjezdy, spojení a živá mapa veřejné dopravy. První integrace: Pražská integrovaná doprava.',
  applicationName: 'Doprava',
  appleWebApp: { capable: true, title: 'Doprava', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F4F3F8' }, { media: '(prefers-color-scheme: dark)', color: '#0F0C1C' }],
};

const themeInit = `try{var s=JSON.parse(localStorage.getItem('doprava.settings.v1')||'{}');var t=s.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>{children}</body>
    </html>
  );
}
