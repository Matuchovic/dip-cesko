'use client';
import { createStore } from './store';
import type { Departure } from '@/domain/model';

/** Aktivní upozornění na odjezdy (jen v tomto zařízení; server zná jen anonymní push adresu). */
export interface ActiveWatch { id: string; token: string; key: string; notifyAt: string; label: string }
const KEY = 'doprava.watches.v1';
export const watchesStore = createStore<{ items: ActiveWatch[] }>({ items: [] });
export const depKey = (stop: string, d: Departure) => `${stop}|${d.route.shortName}|${d.headsign}|${d.scheduledAt}`;

let hydrated = false;
export function hydrateWatches() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const items = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as ActiveWatch[]).filter((w) => w && typeof w.id === 'string' && Date.parse(w.notifyAt) > Date.now() - 15 * 60_000);
    watchesStore.set({ items });
  } catch { /* poškozená data */ }
}
const persist = (items: ActiveWatch[]) => { watchesStore.set({ items }); try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* soukromý režim */ } };

export type WatchError = 'unsupported' | 'denied' | 'unavailable' | 'tooLate' | 'error';
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}
const toKey = (b64: string) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** Odběr upozornění pro rodičovskou kontrolu: bez dotazu na povolení, když ho uživatel ještě nedal (ask=false). */
export async function subscriptionForPush(ask: boolean): Promise<PushSubscription | WatchError> {
  if (!ask && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) return 'denied';
  return subscription();
}
async function subscription(): Promise<PushSubscription | WatchError> {
  if (!pushSupported()) return 'unsupported';
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') return 'denied';
  const keyRes = await fetch('/api/push/key').catch(() => null);
  if (!keyRes?.ok) return 'unavailable';
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  try { return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }); } catch { return 'error'; }
}

export async function watchDeparture(stop: string, stopName: string, d: Departure, leadMin: 2 | 5 | 10, lang: 'cs' | 'en'): Promise<ActiveWatch | WatchError> {
  if (!d.scheduledAt || Date.parse(d.predictedAt ?? d.scheduledAt) - Date.now() < leadMin * 60_000 - 30_000) return 'tooLate';
  const sub = await subscription();
  if (typeof sub === 'string') return sub;
  const res = await fetch('/api/push/watch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), stop, stopName, line: d.route.shortName, mode: d.route.mode, headsign: d.headsign, scheduledAt: d.scheduledAt, leadMin, lang }),
  }).catch(() => null);
  if (!res) return 'error';
  if (res.status === 503) return 'unavailable';
  if (!res.ok) return 'error';
  const j = (await res.json()) as { id: string; token: string; notifyAt: string };
  const w: ActiveWatch = { id: j.id, token: j.token, notifyAt: j.notifyAt, key: depKey(stop, d), label: `${d.route.shortName} → ${d.headsign}` };
  persist([...watchesStore.get().items.filter((x) => x.key !== w.key), w]);
  return w;
}

export async function unwatch(key: string): Promise<void> {
  const w = watchesStore.get().items.find((x) => x.key === key);
  if (!w) return;
  persist(watchesStore.get().items.filter((x) => x.key !== key));
  await fetch(`/api/push/watch?id=${encodeURIComponent(w.id)}&token=${encodeURIComponent(w.token)}`, { method: 'DELETE' }).catch(() => undefined);
}
