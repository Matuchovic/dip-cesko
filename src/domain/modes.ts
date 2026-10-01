import type { Mode } from './model';

/** GTFS route_type (základní i rozšířené kódy) → kategorie dopravy. */
export function modeFromRouteType(rt: number | null | undefined): Mode {
  if (rt === null || rt === undefined || !Number.isFinite(rt)) return 'other';
  if (rt === 0 || (rt >= 900 && rt < 1000)) return 'tram';
  if (rt === 1 || (rt >= 400 && rt < 500)) return 'metro';
  if (rt === 2 || (rt >= 100 && rt < 200)) return 'train';
  if (rt === 3 || (rt >= 700 && rt < 800)) return 'bus';
  if (rt === 11 || rt === 800) return 'trolleybus';
  if (rt === 4 || rt === 1000 || rt === 1200) return 'ferry';
  if (rt === 7 || rt === 1400) return 'funicular';
  return 'other';
}

export const MODE_LABEL: Record<Mode, string> = {
  tram: 'Tramvaj', metro: 'Metro', train: 'Vlak', bus: 'Autobus', trolleybus: 'Trolejbus', ferry: 'Přívoz', funicular: 'Lanovka', other: 'Spoj',
};
export const MODE_LABEL_PLURAL: Record<Mode, string> = {
  tram: 'Tramvaje', metro: 'Metro', train: 'Vlaky', bus: 'Autobusy', trolleybus: 'Trolejbusy', ferry: 'Přívozy', funicular: 'Lanovky', other: 'Ostatní',
};
/** Barvy kategorií (kontrast s bílým textem ≥ 4.5:1). */
export const MODE_COLOR: Record<Mode, string> = {
  tram: '#B3122E', metro: '#2C1260', train: '#1450C8', bus: '#00648A', trolleybus: '#2F7A3A', ferry: '#0E6C80', funicular: '#7A4B00', other: '#4B4A57',
};
