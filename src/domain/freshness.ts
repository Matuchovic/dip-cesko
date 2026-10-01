/** Prahy stáří naměřené polohy. „Živě“ se odvozuje výhradně ze skutečného stáří měření. */
export const POSITION_LIVE_MAX_S = 90;
export const POSITION_STALE_MAX_S = 300;
/** Stáří odpovědi zdroje, nad které se data celkově označí jako zastaralá. */
export const FEED_LIVE_MAX_S = 60;

export type PositionFreshness = 'live' | 'stale' | 'expired' | 'unknown';

export function classifyPositionAge(ageSeconds: number | null): PositionFreshness {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return 'unknown';
  if (ageSeconds < -120) return 'unknown';
  if (ageSeconds <= POSITION_LIVE_MAX_S) return 'live';
  if (ageSeconds <= POSITION_STALE_MAX_S) return 'stale';
  return 'expired';
}
