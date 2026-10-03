'use client';
import { createStore } from './store';

/**
 * Úvodní průvodce: zobrazí se při každém spuštění aplikace, dokud uživatel nezvolí „Již nezobrazovat“.
 * „Přeskočit“ ho zavře jen do příštího spuštění (sessionStorage).
 */
const NEVER_KEY = 'doprava.onboarding.v1';
const SESSION_KEY = 'doprava.onboarding.session';
export const onboardingStore = createStore<{ open: boolean }>({ open: false });

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export function initOnboarding() {
  if (typeof window === 'undefined') return;
  const never = safe(() => localStorage.getItem(NEVER_KEY) === 'never', false);
  const skipped = safe(() => sessionStorage.getItem(SESSION_KEY) === 'done', false);
  if (!never && !skipped) onboardingStore.set({ open: true });
}
export function closeOnboarding(mode: 'skip' | 'never' | 'done') {
  safe(() => sessionStorage.setItem(SESSION_KEY, 'done'), undefined);
  if (mode === 'never') safe(() => localStorage.setItem(NEVER_KEY, 'never'), undefined);
  onboardingStore.set({ open: false });
}
export function onboardingDisabled(): boolean { return safe(() => localStorage.getItem(NEVER_KEY) === 'never', false); }
/** Z Nastavení: znovu zapnout a hned ukázat. */
export function reopenOnboarding() {
  safe(() => localStorage.removeItem(NEVER_KEY), undefined);
  onboardingStore.set({ open: true });
}
