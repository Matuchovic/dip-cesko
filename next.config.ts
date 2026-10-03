import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Verze a otisk sestavení se zapečou do kódu v prohlížeči i na serveru.
// Otisk je na Vercelu hash commitu – liší se u každého nasazení, takže se nová verze pozná
// i tehdy, když se číslo verze zapomene zvýšit. Číslo verze je pro člověka.
const APP_VERSION = (JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_BUILD_ID ?? 'local';

// Povolené zdroje pro mapový podklad. Výchozí je OpenFreeMap; další lze přidat proměnnou MAP_EXTRA_ORIGINS (čárkami).
const mapOrigins = ['https://tiles.openfreemap.org', ...(process.env.MAP_EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mapOrigins.join(' ')}`,
  "font-src 'self' data:",
  `connect-src 'self' ${mapOrigins.join(' ')}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION, NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CSP s nonce nastavuje src/proxy.ts pro stránky; zde jen záložní přísná politika pro ostatní odpovědi
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(), payment=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
