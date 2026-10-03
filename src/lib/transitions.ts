'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Plynulé přechody mezi obrazovkami (View Transitions API). Animuje se jen obsah panelu,
 * mapa zůstává klidná. Bez podpory prohlížeče nebo s omezenými animacemi = okamžitá navigace.
 */
let pending: (() => void) | null = null;
type Doc = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };

export function navigateWithTransition(go: () => void) {
  const doc = typeof document !== 'undefined' ? (document as Doc) : null;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc?.startViewTransition || reduced) { go(); return; }
  doc.startViewTransition(() => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { pending = null; resolve(); }, 800); // pojistka: nikdy nezablokovat UI
    pending = () => { clearTimeout(timer); pending = null; resolve(); };
    go();
  }));
}

/** V kořeni aplikace: po změně adresy dokončí rozpracovaný přechod (až po vykreslení nové obrazovky). */
export function useTransitionResolver() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!pending) return;
    const done = pending;
    requestAnimationFrame(() => done());
  }, [pathname, search]);
}
