'use client';
import { createStore } from './store';

/** Uložená místa Domů a Práce (jen v tomto zařízení). */
export interface SavedPlace { name: string; key: string; lat: number; lon: number }
type Places = { home: SavedPlace | null; work: SavedPlace | null };
const KEY = 'doprava.places.v1';
export const placesStore = createStore<Places>({ home: null, work: null });

const valid = (p: unknown): p is SavedPlace => !!p && typeof p === 'object' && typeof (p as SavedPlace).name === 'string' && typeof (p as SavedPlace).key === 'string'
  && Number.isFinite((p as SavedPlace).lat) && Number.isFinite((p as SavedPlace).lon) && (p as SavedPlace).name.length <= 120;

let hydrated = false;
export function hydratePlaces() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Places> | null;
    placesStore.set({ home: valid(raw?.home) ? raw!.home! : null, work: valid(raw?.work) ? raw!.work! : null });
  } catch { /* poškozená data ignorujeme */ }
}
export function setPlace(kind: 'home' | 'work', place: SavedPlace | null) {
  placesStore.set({ [kind]: place } as Partial<Places>);
  try { localStorage.setItem(KEY, JSON.stringify(placesStore.get())); } catch { /* soukromý režim */ }
}
