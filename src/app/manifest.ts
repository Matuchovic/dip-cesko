import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'DopravaČR – najdi si spoj, kdykoliv, kdekoliv', short_name: 'DopravaČR',
    description: 'Odjezdy, spojení a živá mapa veřejné dopravy v reálném čase.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any', lang: 'cs', dir: 'auto',
    background_color: '#EEEAE2', theme_color: '#EEEAE2', categories: ['travel', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Odjezdy', url: '/odjezdy', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Spojení', url: '/spojeni', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
