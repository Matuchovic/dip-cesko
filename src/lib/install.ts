'use client';
import { createStore } from './store';

type PromptEvent = Event & { prompt(): Promise<void>; userChoice?: Promise<{ outcome: string }> };
/** Instalace PWA: Android/desktop nabídka prohlížeče, iPhone ruční postup. Mimo prohlížeč (server) vše false. */
export const installStore = createStore<{ prompt: PromptEvent | null; installed: boolean; ios: boolean }>({ prompt: null, installed: false, ios: false });

let ready = false;
export function initInstall() {
  if (ready || typeof window === 'undefined') return;
  ready = true;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  installStore.set({ installed: Boolean(standalone), ios: /iphone|ipad|ipod/i.test(navigator.userAgent) });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installStore.set({ prompt: e as PromptEvent }); });
  window.addEventListener('appinstalled', () => installStore.set({ installed: true, prompt: null }));
}

export async function installNow() {
  const p = installStore.get().prompt;
  if (!p) return;
  await p.prompt();
  installStore.set({ prompt: null });
}
