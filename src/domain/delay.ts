import type { Delay } from './model';

export type DelayTone = 'ok' | 'late' | 'early' | 'unknown';

/** Text a tón pro zobrazení zpoždění. Neznámá hodnota se nikdy nezobrazí jako „Včas“. */
export function describeDelay(delay: Delay): { label: string; short: string; tone: DelayTone } {
  if (delay.kind === 'unknown') return { label: 'Zpoždění neznámé', short: '?', tone: 'unknown' };
  const s = delay.seconds;
  if (Math.abs(s) < 30) return { label: 'Včas', short: '0', tone: 'ok' };
  const min = Math.round(Math.abs(s) / 60) || 1;
  return s > 0 ? { label: `Zpoždění ${min} min`, short: `+${min}`, tone: 'late' } : { label: `Napřed ${min} min`, short: `−${min}`, tone: 'early' };
}
