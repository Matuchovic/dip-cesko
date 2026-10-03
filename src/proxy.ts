import { NextResponse, type NextRequest } from 'next/server';

/**
 * Přísná Content-Security-Policy s jednorázovým nonce pro každý požadavek (podle oficiálního návodu Next.js):
 * spustí se jen skripty aplikace s platným nonce – vložený cizí skript (XSS) neprojde.
 */
const mapOrigins = ['https://tiles.openfreemap.org', ...(process.env.MAP_EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mapOrigins.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${mapOrigins.join(' ')}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // stránky (ne API, statické soubory, obrázky ani service worker)
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico|sw.js|icons|brand|vehicles|maplibre|map|fonts|manifest.webmanifest).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }],
};
