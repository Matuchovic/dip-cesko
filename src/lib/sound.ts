'use client';
/**
 * Tramvajový zvonek (dvojí „cink“) syntetizovaný ve Web Audio – bez zvukového souboru.
 * Prohlížeče pustí zvuk až po interakci uživatele: kontext se odemkne prvním klepnutím.
 */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = ctx ?? new AC();
  return ctx;
}
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}
function tone(c: AudioContext, f: number, t0: number, d: number, gain: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = f;
  const t = c.currentTime + t0;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.05);
}
/** Kovový úder: základní tón a dva neharmonické alikvoty jako u skutečného zvonku. */
function strike(c: AudioContext, t0: number) { [1, 2.76, 5.4].forEach((m, i) => tone(c, 1180 * m, t0, 1.1 - i * 0.25, 0.22 / (i + 1))); }
export function playTramBell() {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  strike(c, 0); strike(c, 0.28);
}
