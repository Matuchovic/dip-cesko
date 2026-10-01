'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string, ssr = false): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => ssr,
  );
}

/** Opakované volání jen při viditelné stránce; po návratu proběhne hned. */
export function useVisibleInterval(fn: () => void, ms: number, deps: unknown[]) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(() => ref.current(), ms); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.visibilityState === 'visible') { ref.current(); start(); } else stop(); };
    ref.current();
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await fetch(url, { signal, cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, status: 0, body: null };
  }
}
