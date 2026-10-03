/* Doprava – service worker: offline obal aplikace a poslední data s jasně označeným stářím. */
const VERSION = 'doprava-v16';
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
// ---------- rodičovská kontrola: zprávy se dešifrují až tady, v telefonu ----------
function famIdb(store, id) {
  return new Promise((res) => {
    const r = indexedDB.open('doprava-family', 1);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['keys', 'links', 'presets', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const q = r.result.transaction(store, 'readonly').objectStore(store).get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } };
  });
}
const famB64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
async function famText(f) {
  const link = await famIdb('links', f.linkId);
  const en = link && link.lang === 'en';
  const name = (link && link.peerName) || (en ? 'Your child' : 'Dítě');
  if (f.type === 'joined') return { t: en ? '👨‍👩‍👧 Child connected' : '👨‍👩‍👧 Dítě se připojilo', b: en ? 'Open the app to finish pairing.' : 'Otevři aplikaci a dokonči spárování.' };
  if (f.type === 'unlink') return { t: en ? 'Connection ended' : 'Spojení zrušeno', b: name };
  if (f.type === 'auto') {
    if (f.kind === 'delay') return { t: `⏱ ${name}: ${en ? 'line' : 'linka'} ${f.line} +${f.min} min`, b: en ? 'The vehicle is running late.' : 'Spoj má zpoždění.' };
    if (f.kind === 'arrived') return { t: `📍 ${name}: ${en ? 'arrived' : 'v cíli'}`, b: `${en ? 'Line' : 'Linka'} ${f.line} → ${f.stopName || ''}` };
    if (f.kind === 'noconfirm') return { t: `⚠️ ${name}`, b: en ? 'Arrived 10 min ago but hasn’t confirmed yet.' : 'Spoj dojel před 10 min, ale zatím nepotvrdil(a) příchod.' };
    if (f.kind === 'canceled') return { t: `❌ ${en ? 'Line' : 'Linka'} ${f.line}`, b: en ? `${name}'s service is cancelled.` : `Spoj (${name}) je zrušený.` };
  }
  let d = null;
  if (link && link.key && f.ct && f.iv) { try { d = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: famB64(f.iv) }, link.key, famB64(f.ct)))); } catch { d = null; } }
  if (f.kind === 'board') return { t: `🚋 ${name} ${en ? 'is riding' : 'jede'}`, b: d ? `${d.line} → ${d.toName || d.headsign || ''}` : '' };
  if (f.kind === 'arrive') return { t: `🏁 ${name} ${en ? 'arrived' : 'je v cíli'}`, b: '' };
  if (f.kind === 'sos') return { t: `🆘 ${name} ${en ? 'needs help' : 'potřebuje pomoc'}`, b: d && d.lat ? (en ? 'Location attached – open the app.' : 'Poloha přiložena – otevři aplikaci.') : (en ? 'Open the app.' : 'Otevři aplikaci.') };
  if (f.kind === 'pause') return { t: `⏸ ${name}`, b: en ? 'Sharing switched off.' : 'Sdílení vypnuto.' };
  if (f.kind === 'resume') return { t: `▶️ ${name}`, b: en ? 'Sharing switched on.' : 'Sdílení zapnuto.' };
  if (f.kind === 'hello') return null;
  return { t: name, b: '' };
}
self.addEventListener('push', (event) => {
  let msg = { title: 'DopravaČR', body: '', url: '/', tag: 'dopravacr', actions: [] };
  try { if (event.data) msg = { ...msg, ...event.data.json() }; } catch { /* prostý text */ }
  const actions = (Array.isArray(msg.actions) ? msg.actions : []).slice(0, 2).map((a) => ({ action: String(a.action).slice(0, 16), title: String(a.title).slice(0, 30) }));
  const urls = { _: safeUrl(msg.url) };
  for (const a of Array.isArray(msg.actions) ? msg.actions.slice(0, 2) : []) urls[String(a.action).slice(0, 16)] = safeUrl(a.url);
  event.waitUntil((async () => {
    if (msg.fam) {
      const f = msg.fam, x = await famText(f);
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) c.postMessage({ type: 'family-update', linkId: f.linkId });
      if (!x) return;
      await self.registration.showNotification(x.t.slice(0, 90), { body: x.b.slice(0, 200), tag: `fam-${f.linkId}-${f.kind || f.type}`, renotify: true, requireInteraction: f.kind === 'sos', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', data: { urls: { _: '/rodina' } }, vibrate: f.kind === 'sos' ? [200, 100, 200, 100, 400] : [90, 70, 90] });
      return;
    }
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
