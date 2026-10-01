'use client';
import { useSyncExternalStore } from 'react';

export interface Store<T> { get(): T; set(patch: Partial<T> | ((s: T) => Partial<T>)): void; subscribe(l: () => void): () => void }

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof T)[]) if (!Object.is(state[k], p[k])) { changed = true; break; }
      if (!changed) return;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

/** Selektor musí vracet stabilní hodnotu (primitivum nebo referenci uloženou ve stavu). */
export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
