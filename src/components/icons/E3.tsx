import { E3_CSS, E3_DEFS, E3_ICONS, type E3Name } from './e3-data';

export type { E3Name };
/**
 * Vlastní 3D ikona. motion: 'auto' se jemně hýbe, 'hover' jen pod kurzorem/fokusem (karty v seznamech),
 * 'none' je statická (malé ikony v textu – bez stínu a animace, kvůli ostrosti a výkonu).
 */
export default function E3({ name, size = 24, motion, className = '', label }: { name: E3Name; size?: number; motion?: 'auto' | 'hover' | 'none'; className?: string; label?: string }) {
  const ic = E3_ICONS[name];
  if (!ic) return null;
  const m = motion ?? (size >= 36 ? 'auto' : 'none');
  const inner = m === 'none'
    ? `<g>${ic.body}</g>`
    : `<ellipse class="e3-gs" cx="48" cy="90" rx="26" ry="4" fill="rgba(15,35,65,.22)" filter="url(#e3-blur2)"/><g class="e3-a-${ic.anim}" filter="url(#e3-drop)">${ic.body}</g>`;
  return (
    <svg className={`e3 e3-m-${m} ${className}`} width={size} height={size} viewBox="0 0 96 96" focusable="false"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

/** Společné přechody a filtry – jednou v dokumentu. */
export function E3Defs() {
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden focusable="false" dangerouslySetInnerHTML={{ __html: `<defs>${E3_DEFS}</defs>` }} />
      <style dangerouslySetInnerHTML={{ __html: `${E3_CSS}
.e3{display:inline-block;flex:none;overflow:visible;vertical-align:-0.2em}
.e3 *{transform-box:view-box}
.e3-m-none *{animation:none!important}
.e3-m-hover *{animation-play-state:paused!important}
.e3-host:hover .e3-m-hover *,.e3-host:focus-visible .e3-m-hover *,.e3-host:focus-within .e3-m-hover *{animation-play-state:running!important}
@media (prefers-reduced-motion:reduce){.e3 *{animation:none!important}}` }} />
    </>
  );
}
