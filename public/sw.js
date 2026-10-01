/* Doprava – service worker: offline obal aplikace a poslední data s jasně označeným stářím. */
const VERSION = 'doprava-v3';
const SHELL = `${VERSION}-shell`, STATIC = `${VERSION}-static`, API = `${VERSION}-api`;
const SHELL_URLS = ['/', '/odjezdy', '/spojeni', '/oblibene', '/jizdenky', '/nastaveni', '/map/offline-style.json', '/icons/icon-192.png'];
const STATIC_PREFIXES = ['/_next/static/', '/vehicles/', '/icons/', '/map/', '/maplibre/'];
const API_CACHEABLE = /^\/api\/(vehicles|departures|alerts)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // mapové dlaždice a cizí zdroje necacheujeme
  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) { e.respondWith(cacheFirst(req)); return; }
  if (API_CACHEABLE.test(url.pathname)) { e.respondWith(apiNetworkFirst(req)); return; }
  if (req.mode === 'navigate') e.respondWith(navigate(req));
});

async function cacheFirst(req) {
  const c = await caches.open(STATIC);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

/** Síť má přednost. Z cache se vrací jen při výpadku – s hlavičkou x-doprava-offline a stavem „zastaralé“, nikdy jako živá data. */
async function apiNetworkFirst(req) {
  const c = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (!hit) throw err;
    let body;
    try { body = await hit.json(); } catch { return hit; }
    if (body && body.meta) {
      if (body.meta.status === 'live') body.meta.status = 'stale';
      body.meta.message = 'Offline – zobrazena naposledy uložená data.';
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'x-doprava-offline': '1' } });
  }
}

async function navigate(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('/')) || Response.error();
  }
}
