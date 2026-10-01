import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Doprava — Celé Česko', short_name: 'Doprava', description: 'Odjezdy, spojení a živá mapa veřejné dopravy.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any', lang: 'cs', background_color: '#F4F3F8', theme_color: '#2C1260',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
