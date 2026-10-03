'use client';
/**
 * 3D náklon karet za kurzorem (jako na MatuchaDev): malé úhly, aby text zůstal ostrý,
 * lesk se posouvá se světlem. Jen na zařízeních s myší a bez omezení pohybu.
 */
export const TILT_SELECTOR = '.lm-card, .card, .alert-card, .itinerary, .place-row, .near-card';
export function initTilt(): () => void {
  if (typeof window === 'undefined' || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  let active: HTMLElement | null = null;
  const reset = (el: HTMLElement) => { el.classList.remove('tilting'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
  const onMove = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(TILT_SELECTOR) ?? null;
    if (active && active !== el) reset(active);
    active = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    const k = Math.min(1, 420 / Math.max(r.width, r.height)); // velké karty se naklánějí méně
    el.style.setProperty('--rx', `${(-y * 6 * k).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 7 * k).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    el.classList.add('tilting');
  };
  const onLeave = () => { if (active) reset(active); active = null; };
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); window.removeEventListener('blur', onLeave); };
}
