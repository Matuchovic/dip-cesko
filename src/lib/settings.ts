'use client';
import { createStore } from './store';
import { isLocale, type Locale } from '@/i18n/locales';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  motion: 'system' | 'reduce' | 'full';
  vehicleStyle: 'sprites' | 'markers';
  buildings3d: boolean;
  showStops: boolean;
  language: 'auto' | Locale;
}
const KEY = 'doprava.settings.v1';
export const DEFAULT_SETTINGS: Settings = { theme: 'light', motion: 'system', vehicleStyle: 'sprites', buildings3d: true, showStops: true, language: 'auto' };

function load(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      theme: ['system', 'light', 'dark'].includes(raw.theme as string) ? (raw.theme as Settings['theme']) : DEFAULT_SETTINGS.theme,
      motion: ['system', 'reduce', 'full'].includes(raw.motion as string) ? (raw.motion as Settings['motion']) : DEFAULT_SETTINGS.motion,
      vehicleStyle: raw.vehicleStyle === 'markers' ? 'markers' : 'sprites',
      buildings3d: raw.buildings3d !== false,
      showStops: raw.showStops !== false,
      language: isLocale(raw.language) ? raw.language : 'auto',
    };
  } catch { return DEFAULT_SETTINGS; }
}

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);
let hydrated = false;
export function hydrateSettings() {
  if (hydrated) return;
  hydrated = true;
  settingsStore.set(load());
  settingsStore.subscribe(() => {
    const s = settingsStore.get();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* úložiště nedostupné */ }
    applyTheme(s.theme);
  });
  applyTheme(settingsStore.get().theme);
}

export function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.motion === 'reduce') return true;
  if (s.motion === 'full') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
