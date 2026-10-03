/* Doprava – service worker: offline obal aplikace a poslední data s jasně označeným stářím. */
const VERSION = 'doprava-v14';
const SHELL = `${VERSION}-shell`, STATIC = `${VERSION}-static`, API = `${VERSION}-api`;
const SHELL_URLS = ['/', '/odjezdy', '/spojeni', '/oblibene', '/jizdenky', '/nastaveni', '/map/offline-style.json', '/icons/icon-192.png', '/brand/logo.png', '/brand/logo-dark.png', '/favicon.ico'];
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

// ---------- upozornění na blížící se spoj (Web Push) ----------
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : '/');
self.addEventListener('push', (event) => {
  let msg = { title: 'DopravaČR', body: '', url: '/', tag: 'dopravacr', actions: [] };
  try { if (event.data) msg = { ...msg, ...event.data.json() }; } catch { /* prostý text */ }
  const actions = (Array.isArray(msg.actions) ? msg.actions : []).slice(0, 2).map((a) => ({ action: String(a.action).slice(0, 16), title: String(a.title).slice(0, 30) }));
  const urls = { _: safeUrl(msg.url) };
  for (const a of Array.isArray(msg.actions) ? msg.actions.slice(0, 2) : []) urls[String(a.action).slice(0, 16)] = safeUrl(a.url);
  event.waitUntil((async () => {
    await self.registration.showNotification(String(msg.title).slice(0, 90), {
      body: String(msg.body).slice(0, 240), tag: String(msg.tag).slice(0, 64), renotify: true, requireInteraction: false, timestamp: Date.now(),
      icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', data: { urls }, actions, vibrate: [90, 70, 90, 70, 160],
    });
    // otevřená aplikace zahraje tramvajový zvonek a ukáže upozornění i v sobě
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) c.postMessage({ type: 'dopravacr-alert', title: String(msg.title).slice(0, 90), body: String(msg.body).slice(0, 240), url: urls._ });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urls = (event.notification.data && event.notification.data.urls) || {};
  const url = new URL(safeUrl(urls[event.action] || urls._ || '/'), self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (new URL(c.url).origin === self.location.origin) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; } }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
