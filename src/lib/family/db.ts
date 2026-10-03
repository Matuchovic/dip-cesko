'use client';
/**
 * Úložiště rodičovské kontroly v zařízení (IndexedDB). Klíče jsou CryptoKey objekty, které nejde vyexportovat,
 * takže je nelze z prohlížeče vytáhnout ani skriptem. Čte je i servisní pracovník (dešifrování upozornění).
 */
export interface Device { id: 'device'; privateKey: CryptoKey; pub: string }
export interface StoredLink {
  id: string; role: 'parent' | 'child'; token: string; peerPub: string; key: CryptoKey;
  peerName: string; myName: string; emojis: string[]; lang: 'cs' | 'en'; createdAt: string;
}
export interface Preset { id: 'school' | 'home'; key: string; name: string }
const DB = 'doprava-family', VER = 1;

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['keys', 'links', 'presets', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store), req = fn(s);
    t.oncomplete = () => res(req ? (req as IDBRequest<T>).result : undefined); t.onerror = () => rej(t.error);
  });
}
export const famDb = {
  get: <T,>(store: string, id: string) => tx<T>(store, 'readonly', (s) => s.get(id) as IDBRequest<T>),
  all: <T,>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then((x) => x ?? []),
  put: <T extends { id: string }>(store: string, v: T) => tx(store, 'readwrite', (s) => { s.put(v); }),
  del: (store: string, id: string) => tx(store, 'readwrite', (s) => { s.delete(id); }),
};
