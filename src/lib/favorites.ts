'use client';
import type { Mode } from '@/domain/model';
import { createStore } from './store';

export interface FavoriteStop { kind: 'stop'; key: string; name: string; modes: Mode[]; savedAt: string }
export interface FavoriteLine { kind: 'line'; key: string; line: string; mode: Mode; headsign: string | null; savedAt: string }
export interface FavoritePlace { kind: 'place'; key: string; label: string; lat: number; lon: number; savedAt: string }
export type Favorite = FavoriteStop | FavoriteLine | FavoritePlace;

const KEY = 'doprava.favorites.v1';
export const favoritesStore = createStore<{ items: Favorite[] }>({ items: [] });
let hydrated = false;

/** Oblíbené jsou uložené jen v tomto zařízení (bez povinné registrace). */
export function hydrateFavorites() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) favoritesStore.set({ items: raw.filter((x): x is Favorite => typeof x === 'object' && x !== null && 'kind' in x && 'key' in x).slice(0, 200) });
  } catch { /* poškozená data ignorujeme */ }
  favoritesStore.subscribe(() => { try { localStorage.setItem(KEY, JSON.stringify(favoritesStore.get().items)); } catch { /* plné úložiště */ } });
}

export const favId = (f: Pick<Favorite, 'kind' | 'key'>) => `${f.kind}:${f.key}`;
export function isFavorite(items: Favorite[], kind: Favorite['kind'], key: string) { return items.some((f) => f.kind === kind && f.key === key); }
export function toggleFavorite(f: Favorite) {
  const items = favoritesStore.get().items;
  favoritesStore.set({ items: isFavorite(items, f.kind, f.key) ? items.filter((x) => favId(x) !== favId(f)) : [f, ...items] });
}
